defmodule WalkieTalkie.Repo.Migrations.CreateRoomAccess do
  use Ecto.Migration

  def change do
    create table(:room_access) do
      add :room_id, references(:rooms, on_delete: :delete_all)
      add :user_id, references(:users, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:room_access, [:room_id, :user_id])
  end
end
