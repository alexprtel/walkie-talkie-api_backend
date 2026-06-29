defmodule WalkieTalkie.Repo.Migrations.AddRoomDetails do
  use Ecto.Migration

  def change do
    alter table(:rooms) do
      add :description, :string
      add :is_private, :boolean, default: false
      add :max_participants, :integer, default: 10
      add :invite_code, :string
    end

    create index(:rooms, [:invite_code], unique: true)
  end
end
