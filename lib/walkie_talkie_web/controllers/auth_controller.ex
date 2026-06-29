defmodule WalkieTalkieWeb.AuthController do
  use WalkieTalkieWeb, :controller

  alias WalkieTalkie.Accounts
  alias WalkieTalkie.User

  def register(conn, params) do
    case Accounts.register_user(params) do
      {:ok, user} ->
        conn
        |> put_status(:created)
        |> json(%{id: user.id, email: user.email, name: user.name, inserted_at: user.inserted_at})
      {:error, changeset} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: changeset_errors(changeset)})
    end
  end

  def login(conn, %{"email" => email, "password" => password}) do
    user = Accounts.get_user_by_email(email)
    if user && Pbkdf2.verify_pass(password, user.password_hash) do
      {:ok, token} = WalkieTalkie.Guardian.generate_token(user)
      # Marcar usuario como online
      WalkieTalkie.Presence.mark_online(user.id, user.name, user.email)
      json(conn, %{token: token, user: %{id: user.id, email: user.email, name: user.name}})
    else
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Invalid email or password"})
    end
  end


  def me(conn, _params) do
    user = conn.assigns.current_user
    if user do
      json(conn, %{id: user.id, email: user.email, name: user.name})
    else
      conn
      |> put_status(:unauthorized)
      |> json(%{error: "Not authenticated"})
    end
  end

    # para validar el estado
def logout(conn, _params) do
  current_user = conn.assigns.current_user
  if current_user do
    WalkieTalkie.Presence.mark_offline(current_user.id)
  end
  json(conn, %{ok: true})
end





  defp changeset_errors(changeset) do
    Ecto.Changeset.traverse_errors(changeset, fn {msg, opts} ->
      Enum.reduce(opts, msg, fn {key, value}, acc ->
        String.replace(acc, "%{#{key}}", to_string(value))
      end)
    end)
  end


  #para google
  def google_login(conn, %{"email" => email, "name" => name, "google_id" => google_id}) do
  # Buscar usuario por email o por google_id (puedes agregar un campo google_id en users)
  user = Accounts.get_user_by_email(email)
  if user do
    # Si ya existe, actualizar google_id si no lo tiene (opcional)
    {:ok, token} = WalkieTalkie.Guardian.generate_token(user)
    WalkieTalkie.Presence.mark_online(user.id, user.name, user.email)
    json(conn, %{token: token, user: %{id: user.id, email: user.email, name: user.name}})
  else
    # Crear usuario nuevo con contraseña aleatoria (no se usará)
    random_password = :crypto.strong_rand_bytes(16) |> Base.encode64()
    case Accounts.register_user(%{email: email, password: random_password, name: name}) do
      {:ok, user} ->
        {:ok, token} = WalkieTalkie.Guardian.generate_token(user)
        WalkieTalkie.Presence.mark_online(user.id, user.name, user.email)
        json(conn, %{token: token, user: %{id: user.id, email: user.email, name: user.name}})
      {:error, _} ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "Error creating user"})
    end
  end
end

end
