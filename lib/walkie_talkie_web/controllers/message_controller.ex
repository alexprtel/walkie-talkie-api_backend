defmodule WalkieTalkieWeb.MessageController do
  use WalkieTalkieWeb, :controller
  alias WalkieTalkie.Messages
  alias WalkieTalkie.Rooms

  def start(conn, %{"room_id" => room_id}) do
    current_user = conn.assigns.current_user
    if Rooms.is_participant?(room_id, current_user.id) do
      case Messages.start_message(room_id, current_user.id) do
        {:ok, message} -> json(conn, %{message_id: message.id})
        {:error, changeset} ->
          conn |> put_status(:unprocessable_entity) |> json(%{errors: changeset_errors(changeset)})
      end
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end

  def add_segment(conn, %{"message_id" => message_id}) do
    current_user = conn.assigns.current_user

    message = Messages.get_message!(message_id)
    room_id = message.room_id

    if not Rooms.is_participant?(room_id, current_user.id) do
      conn
      |> put_status(:forbidden)
      |> json(%{error: "Not a participant"})
    else
      sequence = conn.params["sequence"]
      duration = conn.params["duration"]
      format = conn.params["format"]
      audio = conn.params["audio"]

      cond do
        is_nil(sequence) or is_nil(duration) or is_nil(format) or is_nil(audio) ->
          conn
          |> put_status(:bad_request)
          |> json(%{error: "Missing fields: sequence, duration, format, audio"})

        not audio_file_valid?(audio) ->
          conn
          |> put_status(:bad_request)
          |> json(%{error: "Invalid or empty audio file"})

        true ->
          sequence_int = String.to_integer(sequence)
          duration_int = String.to_integer(duration)

          ext = Path.extname(audio.filename)
          dest_filename = "#{message_id}_seq_#{sequence_int}#{ext}"
          dest_path = Path.join("uploads/segments", dest_filename)

          File.mkdir_p!("uploads/segments")
          File.cp!(audio.path, dest_path)

          case Messages.add_segment(message_id, current_user.id, sequence_int, duration_int, format, dest_path) do
            {:ok, segment} ->
              json(conn, %{segment_id: segment.id, status: "ok"})
            {:error, changeset} ->
              conn
              |> put_status(:unprocessable_entity)
              |> json(%{errors: changeset_errors(changeset)})
          end
      end
    end
  end

  def download_segment(conn, %{"segment_id" => segment_id}) do
    current_user = conn.assigns.current_user

    case Messages.get_segment(segment_id) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Segment not found"})

      segment ->
        message = Messages.get_message!(segment.message_id)
        room_id = message.room_id

        if Rooms.is_participant?(room_id, current_user.id) do
          abs_path = Path.absname(segment.file_path)

          if File.exists?(abs_path) do
            conn
            |> put_resp_content_type("audio/webm", nil)
            |> send_file(200, abs_path)
          else
            conn |> put_status(:not_found) |> json(%{error: "File not found on server"})
          end
        else
          conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
        end
    end
  end

  def finalize(conn, %{"message_id" => message_id}) do
    case Messages.finalize_message(message_id) do
      {:ok, message} ->
        json(conn, %{finalized: true, message_id: message.id})

      {:error, reason} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{error: "Cannot finalize", reason: inspect(reason)})
    end
  end

  def poll_segments(conn, %{"room_id" => room_id, "after_sequence" => after_seq}) do
    current_user = conn.assigns.current_user
    if Rooms.is_participant?(room_id, current_user.id) do
      after_sequence = String.to_integer(after_seq)
      segments = Messages.get_new_segments(room_id, after_sequence)
      render_segments(conn, segments)
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end

  def download_completed_audio(conn, %{"message_id" => message_id}) do
    current_user = conn.assigns.current_user
    message = Messages.get_message!(message_id)
    room_id = message.room_id

    if Rooms.is_participant?(room_id, current_user.id) do
      case message.completed_audio_path do
        nil -> conn |> put_status(:not_found) |> json(%{error: "Audio not ready yet"})
        path ->
          abs_path = Path.absname(path)
          if File.exists?(abs_path) do
            conn
            |> put_resp_content_type("audio/webm", nil)
            |> send_file(200, abs_path)
          else
            conn |> put_status(:not_found) |> json(%{error: "File not found on server"})
          end
      end
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end

  # Valida que el archivo subido exista en disco y pese más de 0 bytes,
  # antes de copiarlo a uploads/segments. Evita guardar segmentos vacíos
  # que luego harían fallar la concatenación con FFmpeg.
  defp audio_file_valid?(%Plug.Upload{path: path}) do
    case File.stat(path) do
      {:ok, %File.Stat{size: size}} when size > 0 -> true
      _ -> false
    end
  end

  defp audio_file_valid?(_), do: false

  defp render_segments(conn, segments) do
    json(conn, %{segments: Enum.map(segments, fn s ->
      %{
        id: s.id,
        sequence: s.sequence_num,
        user_id: s.user_id,
        duration: s.duration,
        format: s.format,
        url: "/api/audio-segments/#{s.id}/file",
        created_at: s.inserted_at
      }
    end)})
  end

  defp changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end

  # Historial de mensajes completos de una sala -Z
  def history(conn, %{"room_id" => room_id}) do
    current_user = conn.assigns.current_user
    if Rooms.is_participant?(room_id, current_user.id) do
      messages = Messages.get_room_messages(room_id)
      render_messages(conn, messages)
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end

  defp render_messages(conn, messages) do
    json(conn, %{messages: Enum.map(messages, fn m ->
      total_duration = Enum.reduce(m.segments, 0, fn s, acc -> acc + s.duration end)
      %{
        id: m.id,
        user: %{id: m.user.id, name: m.user.name},
        finalized_at: m.inserted_at,
        total_duration: total_duration,
        audio_url: "/api/messages/#{m.id}/audio"
      }
    end)})
  end

  # para borrar segmentos
  def clean_expired(conn, %{"room_id" => room_id}) do
    current_user = conn.assigns.current_user
    if Rooms.is_participant?(room_id, current_user.id) do
      count = Messages.clean_expired_segments(5)
      json(conn, %{deleted_count: count, status: "ok"})
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end
end
