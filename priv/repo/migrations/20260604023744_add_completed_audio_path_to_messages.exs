defmodule WalkieTalkie.Repo.Migrations.AddCompletedAudioPathToMessages do
  use Ecto.Migration

  def change do
    alter table(:messages) do
      add :completed_audio_path, :string
    end
  end
end
