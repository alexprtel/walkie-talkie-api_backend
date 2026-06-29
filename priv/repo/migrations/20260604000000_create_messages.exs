defmodule WalkieTalkie.Repo.Migrations.CreateMessages do
  use Ecto.Migration

  def change do
    create table(:messages) do
      add :room_id, references(:rooms, on_delete: :delete_all)
      add :user_id, references(:users, on_delete: :delete_all)
      add :is_finalized, :boolean, default: false
      timestamps()
    end

    create index(:messages, [:room_id])
    create index(:messages, [:user_id])
  end
end
