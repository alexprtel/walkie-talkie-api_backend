defmodule WalkieTalkie.Messages do
  import Ecto.Query
  alias WalkieTalkie.Repo
  alias WalkieTalkie.Message
  alias WalkieTalkie.Segment

  def start_message(room_id, user_id) do
    %Message{}
    |> Message.changeset(%{room_id: room_id, user_id: user_id, is_finalized: false})
    |> Repo.insert()
  end

  def add_segment(message_id, user_id, sequence, duration, format, file_path) do
    %Segment{}
    |> Segment.changeset(%{
      message_id: message_id,
      user_id: user_id,
      sequence_num: sequence,
      duration: duration,
      format: format,
      file_path: file_path,
      status: "available"
    })
    |> Repo.insert()
  end

  @doc """
  Finaliza un mensaje: concatena sus segmentos con FFmpeg y marca
  is_finalized = true.

  A diferencia de la versión anterior, ya NO deja que un fallo de FFmpeg
  haga crashear el proceso (raise sin capturar). Ahora siempre devuelve
  {:ok, message} o {:error, reason}, que es justo lo que tu controller
  ya espera en el `case`.
  """
  def finalize_message(message_id) do
    message = Repo.get!(Message, message_id)

    segments =
      from(s in Segment, where: s.message_id == ^message_id, order_by: s.sequence_num)
      |> Repo.all()

    case concat_segments(segments, message_id) do
      {:ok, nil} ->
        # No había segmentos válidos: se finaliza sin audio
        message
        |> Message.changeset(%{is_finalized: true})
        |> Repo.update()

      {:ok, output_path} ->
        message
        |> Message.changeset(%{is_finalized: true, completed_audio_path: output_path})
        |> Repo.update()

      {:error, reason} ->
        {:error, reason}
    end
  end

  # ---------------------------------------------------------------
  # Concatenación con FFmpeg
  # ---------------------------------------------------------------
  # Devuelve:
  #   {:ok, nil}          -> no había segmentos válidos para concatenar
  #   {:ok, output_path}  -> concatenación exitosa
  #   {:error, reason}    -> algo falló (ya no usa `raise`)
  defp concat_segments([], _message_id), do: {:ok, nil}

  defp concat_segments(segments, message_id) do
    valid_segments = filter_valid_segments(segments)

    if Enum.empty?(valid_segments) do
      IO.puts("WARN: ningún segmento válido para el mensaje #{message_id}, se finaliza sin audio")
      {:ok, nil}
    else
      run_ffmpeg(valid_segments, message_id)
    end
  end

  # Descarta segmentos cuyo archivo no existe o pesa 0 bytes (por ejemplo,
  # si algún segmento llegó corrupto o nunca se guardó bien).
  defp filter_valid_segments(segments) do
    Enum.filter(segments, fn s ->
      path = Path.absname(s.file_path)

      case File.stat(path) do
        {:ok, %File.Stat{size: size}} when size > 0 ->
          true

        _ ->
          IO.puts("WARN: segmento #{s.id} (seq #{s.sequence_num}) inválido o vacío, se omite: #{path}")
          false
      end
    end)
  end

  defp run_ffmpeg(segments, message_id) do
    ffmpeg_path = Application.get_env(:walkie_talkie, :ffmpeg_path, "ffmpeg")

    output_dir = "uploads/completed"
    File.mkdir_p!(output_dir)
    output_path = Path.absname(Path.join(output_dir, "#{message_id}_complete.webm"))

    args =
      Enum.reduce(segments, [], fn s, acc ->
        acc ++ ["-i", Path.absname(s.file_path)]
      end)

    filter = "concat=n=#{length(segments)}:v=0:a=1"
    args = args ++ ["-filter_complex", filter, "-c:a", "libopus", "-b:a", "24k", "-y", output_path]

    IO.puts("Ejecutando: #{ffmpeg_path} #{Enum.join(args, " ")}")

    case System.cmd(ffmpeg_path, args, stderr_to_stdout: true) do
      {output, 0} ->
        if File.exists?(output_path) do
          IO.puts("Audio completo generado: #{output_path}")
          {:ok, output_path}
        else
          IO.puts("ERROR: FFmpeg devolvió status 0 pero el archivo no existe.\n#{output}")
          {:error, "FFmpeg no generó el archivo de salida"}
        end

      {output, status} ->
        IO.puts("ERROR: FFmpeg falló con código #{status}\n#{output}")
        {:error, "FFmpeg concatenation failed (status #{status})"}
    end
  rescue
    e in ErlangError ->
      # Por ejemplo: el binario de ffmpeg_path no existe / no es ejecutable
      IO.puts("ERROR: no se pudo ejecutar FFmpeg: #{inspect(e)}")
      {:error, "No se pudo ejecutar FFmpeg, revisa la ruta configurada"}
  end

  def get_new_segments(room_id, after_sequence) do
    query =
      from s in Segment,
        join: m in assoc(s, :message),
        where: m.room_id == ^room_id and s.sequence_num > ^after_sequence,
        order_by: s.sequence_num,
        select: s

    Repo.all(query)
  end

  def get_segment(segment_id) do
    Repo.get(Segment, segment_id)
  end

  def get_message!(id), do: Repo.get!(Message, id)

  # Estamos agregando para que salgan los mensajes
  def get_room_messages(room_id) do
    query =
      from m in Message,
        where: m.room_id == ^room_id and m.is_finalized == true,
        order_by: [desc: m.inserted_at],
        preload: [:user, segments: ^from(s in Segment, order_by: s.sequence_num)]

    Repo.all(query)
  end

  # para eliminar segmento
  # Elimina segmentos con más de X horas de antigüedad (por defecto 24 horas)
  def clean_expired_segments(minutos \\ 5) do
    cutoff = DateTime.utc_now() |> DateTime.add(-minutos * 300, :second)
    query = from s in Segment, where: s.inserted_at < ^cutoff
    segments = Repo.all(query)

    # Eliminar archivos físicos
    Enum.each(segments, fn s ->
      if s.file_path && File.exists?(s.file_path) do
        File.rm!(s.file_path)
      end
    end)

    # Eliminar registros de la base de datos
    {deleted_count, _} = Repo.delete_all(query)
    deleted_count
  end
end
