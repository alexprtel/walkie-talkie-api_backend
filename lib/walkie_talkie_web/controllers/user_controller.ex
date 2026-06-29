defmodule WalkieTalkieWeb.UserController do
  use WalkieTalkieWeb, :controller
  alias WalkieTalkie.Presence
  alias WalkieTalkie.Accounts

  def online_users(conn, _params) do
  users = Presence.list_all_users()
  json(conn, %{users: users})
  end

def update_profile(conn, %{"name" => name}) do
  current_user = conn.assigns.current_user
  case Accounts.update_user(current_user, %{name: name}) do
    {:ok, user} ->
      json(conn, %{user: %{id: user.id, name: user.name, email: user.email, avatar: user.avatar}})
    {:error, changeset} ->
      errors = Ecto.Changeset.traverse_errors(changeset, fn {msg, _} -> msg end)
      conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
  end
end

 def upload_avatar(conn, %{"avatar" => %Plug.Upload{path: tmp_path, filename: filename}}) do
  current_user = conn.assigns.current_user
  ext = Path.extname(filename)
  avatar_filename = "user_#{current_user.id}_#{:os.system_time(:seconds)}#{ext}"
  upload_dir = "uploads/avatars"
  File.mkdir_p!(upload_dir)
  dest_path = Path.join(upload_dir, avatar_filename)
  File.cp!(tmp_path, dest_path)
  avatar_url = "/uploads/avatars/#{avatar_filename}"
  case Accounts.update_user(current_user, %{avatar: avatar_url}) do
    {:ok, _user} -> json(conn, %{avatar: avatar_url})
    {:error, _} -> conn |> put_status(:unprocessable_entity) |> json(%{error: "Error al guardar avatar"})
  end
end

  defp changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end
end
