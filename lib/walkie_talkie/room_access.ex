defmodule WalkieTalkie.RoomAccess do
  use Ecto.Schema
  import Ecto.Changeset

  schema "room_access" do
    belongs_to :room, WalkieTalkie.Room
    belongs_to :user, WalkieTalkie.User

    timestamps()
  end

  def changeset(access, attrs) do
    access
    |> cast(attrs, [:room_id, :user_id])
    |> validate_required([:room_id, :user_id])
    |> unique_constraint([:room_id, :user_id])
  end
end
