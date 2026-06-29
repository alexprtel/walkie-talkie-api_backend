defmodule WalkieTalkie.Segment do
  use Ecto.Schema
  import Ecto.Changeset

  schema "segments" do
    belongs_to :message, WalkieTalkie.Message
    belongs_to :user, WalkieTalkie.User
    field :sequence_num, :integer
    field :duration, :integer
    field :format, :string
    field :file_path, :string
    field :status, :string

    timestamps()
  end

  def changeset(segment, attrs) do
    segment
    |> cast(attrs, [:message_id, :user_id, :sequence_num, :duration, :format, :file_path, :status])
    |> validate_required([:message_id, :user_id, :sequence_num, :duration, :format, :file_path])
    |> unique_constraint([:message_id, :sequence_num])
  end
end
