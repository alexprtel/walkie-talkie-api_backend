defmodule WalkieTalkie.Room do
  use Ecto.Schema
  import Ecto.Changeset

  schema "rooms" do
    field :name, :string
    field :password_hash, :string
    field :is_active, :boolean, default: true
    belongs_to :creator, WalkieTalkie.User, foreign_key: :creator_id
    has_many :participants, WalkieTalkie.RoomParticipant
    has_many :messages, WalkieTalkie.Message
    #Agregapado para el tema de las salas
    field :description, :string
    field :is_private, :boolean, default: false
    field :max_participants, :integer, default: 10
     field :invite_code, :string

    timestamps()
  end

  def changeset(room, attrs) do
  room
  |> cast(attrs, [:name, :description, :is_private, :max_participants, :invite_code, :password_hash, :creator_id, :is_active])
  |> validate_required([:name, :creator_id])
  |> unique_constraint(:invite_code)
end
end
