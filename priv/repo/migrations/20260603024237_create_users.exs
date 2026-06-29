defmodule WalkieTalkie.Repo.Migrations.CreateUsers do
  use Ecto.Migration

  def change do
    create table(:users) do
      add :email, :string
      add :password_hash, :string
      add :name, :string

      timestamps(type: :utc_datetime)
    end
  end
end
