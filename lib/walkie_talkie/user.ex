defmodule WalkieTalkie.User do
  use Ecto.Schema
  import Ecto.Changeset

  schema "users" do
    field :email, :string
    field :password_hash, :string
    field :name, :string
    field :avatar, :string
    field :password, :string, virtual: true
    timestamps()
  end

 def changeset(user, attrs) do
  user
  |> cast(attrs, [:email, :password, :name, :avatar])
  |> validate_required([:email, :name])   # ← no incluir :password
  |> validate_format(:email, ~r/@/)
  |> validate_length(:password, min: 6)   # solo si se provee
  |> unique_constraint(:email)
  |> put_password_hash()
end

defp put_password_hash(changeset) do
  case get_change(changeset, :password) do
    nil -> changeset
    pass -> put_change(changeset, :password_hash, Pbkdf2.hash_pwd_salt(pass))
  end
end
end
