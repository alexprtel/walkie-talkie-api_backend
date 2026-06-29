defmodule WalkieTalkie.Repo.Migrations.CreateSegments do
  use Ecto.Migration

  def change do
    create table(:segments) do
      add :message_id, references(:messages, on_delete: :delete_all)
      add :user_id, references(:users, on_delete: :delete_all)
      add :sequence_num, :integer
      add :duration, :integer
      add :format, :string
      add :file_path, :string
      add :status, :string, default: "pending"
      timestamps()
    end

    create index(:segments, [:message_id, :sequence_num], unique: true)
    create index(:segments, [:message_id])
    create index(:segments, [:user_id])
  end
end
