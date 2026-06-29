defmodule WalkieTalkie.Message do
  use Ecto.Schema
  import Ecto.Changeset

  schema "messages" do
    belongs_to :room, WalkieTalkie.Room
    belongs_to :user, WalkieTalkie.User
    field :is_finalized, :boolean, default: false
    field :completed_audio_path, :string   # <--- Línea agregada
    has_many :segments, WalkieTalkie.Segment

    timestamps()
  end

  def changeset(message, attrs) do
    message
    |> cast(attrs, [:room_id, :user_id, :is_finalized, :completed_audio_path])  # agregar completed_audio_path
    |> validate_required([:room_id, :user_id])
  end
end
