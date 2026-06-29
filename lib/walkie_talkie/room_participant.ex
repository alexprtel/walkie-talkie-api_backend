defmodule WalkieTalkie.RoomParticipant do
  use Ecto.Schema
  import Ecto.Changeset

  schema "room_participants" do
    belongs_to :room, WalkieTalkie.Room
    belongs_to :user, WalkieTalkie.User
    field :joined_at, :utc_datetime

    timestamps()
  end

  def changeset(participant, attrs) do
    participant
    |> cast(attrs, [:room_id, :user_id, :joined_at])
    |> validate_required([:room_id, :user_id, :joined_at])
    |> unique_constraint([:room_id, :user_id])
  end
end
