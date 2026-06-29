defmodule WalkieTalkie.Repo.Migrations.CreateRoomParticipants do
  use Ecto.Migration

  def change do
    create table(:room_participants) do
      add :joined_at, :utc_datetime
      add :room_id, references(:rooms, on_delete: :nothing)
      add :user_id, references(:users, on_delete: :nothing)

      timestamps(type: :utc_datetime)
    end

    create index(:room_participants, [:room_id])
    create index(:room_participants, [:user_id])
  end
end
