defmodule WalkieTalkie.Accounts do
  import Ecto.Query
  alias WalkieTalkie.Repo
  alias WalkieTalkie.User

  def register_user(attrs) do
    %User{}
    |> User.changeset(attrs)
    |> Repo.insert()
  end

  def get_user_by_email(email) do
    Repo.get_by(User, email: email)
  end

  def get_user!(id), do: Repo.get!(User, id)

  def update_user(user, attrs) do
  user
  |> User.changeset(attrs)
  |> Repo.update()
end
end
