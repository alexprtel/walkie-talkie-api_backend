defmodule WalkieTalkieWeb.RoomController do
  use WalkieTalkieWeb, :controller
  alias WalkieTalkie.Rooms

  # ========== CREATE ==========
  def create(conn, params) when is_map(params) do
    current_user = conn.assigns.current_user
    if is_nil(current_user) do
      conn |> put_status(:unauthorized) |> json(%{error: "Not authenticated"})
    else
      case Rooms.create_room(current_user.id, params) do
        {:ok, room} ->
          conn
          |> put_status(:created)
          |> json(%{
            id: room.id,
            name: room.name,
            has_password: room.password_hash != nil,
            creator_id: room.creator_id,
            is_active: room.is_active,
            inserted_at: room.inserted_at,
            invite_code: room.invite_code
          })
        {:error, changeset} ->
          conn
          |> put_status(:unprocessable_entity)
          |> json(%{errors: changeset_errors(changeset)})
      end
    end
  end

  def create(conn, _), do:
    conn |> put_status(:bad_request) |> json(%{error: "Invalid request body"})

  # ========== JOIN ==========
  def join(conn, %{"room_id" => room_id, "password" => password}) do
    current_user = conn.assigns.current_user
    room = Rooms.get_room!(room_id)

    if Rooms.verify_room_password(room, password) do
      case Rooms.add_participant(room_id, current_user.id) do
        {:ok, _} ->
          json(conn, %{success: true, message: "Joined room"})
        {:error, _} ->
          conn |> put_status(:conflict) |> json(%{error: "Already in room"})
      end
    else
      conn |> put_status(:unauthorized) |> json(%{error: "Invalid password"})
    end
  end

  # ========== PARTICIPANTS ==========
  def participants(conn, %{"room_id" => room_id}) do
    current_user = conn.assigns.current_user
    if Rooms.is_participant?(room_id, current_user.id) do
      participants = Rooms.get_participants(room_id)
      json(conn, %{participants: Enum.map(participants, fn u -> %{id: u.id, name: u.name, email: u.email} end)})
    else
      conn |> put_status(:forbidden) |> json(%{error: "Not a participant"})
    end
  end

  # ========== LEAVE ==========
  def leave(conn, %{"room_id" => room_id}) do
    current_user = conn.assigns.current_user
    case Rooms.remove_participant(room_id, current_user.id) do
      :ok -> json(conn, %{ok: true})
      :error -> conn |> put_status(:not_found) |> json(%{error: "Not a participant"})
    end
  end

  # ========== SHOW (detalle de sala) ==========
  def show(conn, %{"id" => id}) do
    room = Rooms.get_room!(id)
    json(conn, %{
      id: room.id,
      name: room.name,
      description: room.description,
      is_private: room.is_private,
      max_participants: room.max_participants,
      current_participants: Rooms.count_participants(room.id),
      creator_id: room.creator_id,
      invite_code: room.invite_code
    })
  end

  # ========== SHOW BY INVITE CODE ==========
  def show_by_code(conn, %{"code" => code}) do
    case Rooms.get_room_by_invite_code(code) do
      nil ->
        conn |> put_status(:not_found) |> json(%{error: "Código de invitación inválido"})
      room ->
        json(conn, %{
          id: room.id,
          name: room.name,
          is_private: room.is_private,
          has_password: room.password_hash != nil
        })
    end
  end

  # ========== PUBLIC ROOMS ==========
  def public_rooms(conn, _params) do
    rooms = Rooms.list_public_rooms_with_creator()
    json(conn, %{rooms: render_rooms(rooms)})
  end

  # ========== PRIVATE ROOMS (CORREGIDO) ==========
  def private_rooms(conn, _params) do
    current_user = conn.assigns.current_user
    rooms = Rooms.list_private_rooms_for_user(current_user.id)
    json(conn, %{rooms: render_rooms(rooms)})
  end

  # ========== RENDER ROOMS (convierte structs a mapas) ==========
  defp render_rooms(rooms) do
    Enum.map(rooms, fn room ->
      %{
        id: room.id,
        name: room.name,
        description: room.description,
        is_private: room.is_private,
        max_participants: room.max_participants,
        current_participants: Rooms.count_participants(room.id),
        invite_code: room.invite_code,
        creator: %{
          id: room.creator.id,
          name: room.creator.name,
          avatar: String.first(room.creator.name)
        }
      }
    end)
  end

  # ========== CHANGESET ERRORS ==========
  defp changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
