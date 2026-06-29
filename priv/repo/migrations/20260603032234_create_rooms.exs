defmodule WalkieTalkie.Repo.Migrations.CreateRooms do
  use Ecto.Migration

  def change do
    create table(:rooms) do
      add :name, :string
      add :password_hash, :string
      add :is_active, :boolean, default: false, null: false
      add :creator_id, references(:users, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:rooms, [:creator_id])
  end
end
