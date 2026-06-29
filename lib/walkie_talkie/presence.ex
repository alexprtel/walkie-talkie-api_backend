defmodule WalkieTalkie.Presence do
  use GenServer

  @table :user_presence

  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(_) do
    :ets.new(@table, [:set, :public, :named_table])
    {:ok, %{}}
  end

  def mark_online(user_id, name, email) do
    :ets.insert(@table, {user_id, %{status: :online, name: name, email: email, joined_room: nil}})
  end

  def mark_offline(user_id) do
    case :ets.lookup(@table, user_id) do
      [{_, data}] ->
        updated = Map.put(data, :status, :offline)
        updated = Map.put(updated, :joined_room, nil)
        :ets.insert(@table, {user_id, updated})
      _ -> :ok
    end
  end

  def join_room(user_id, room_id) do
    case :ets.lookup(@table, user_id) do
      [{_, data}] ->
        updated = Map.put(data, :status, :in_call)
        updated = Map.put(updated, :joined_room, room_id)
        :ets.insert(@table, {user_id, updated})
      _ -> :ok
    end
  end

  def leave_room(user_id) do
    case :ets.lookup(@table, user_id) do
      [{_, data}] ->
        updated = Map.put(data, :status, :online)
        updated = Map.put(updated, :joined_room, nil)
        :ets.insert(@table, {user_id, updated})
      _ -> :ok
    end
  end

  def list_all_users do
    :ets.tab2list(@table)
    |> Enum.map(fn {user_id, data} ->
      %{
        id: user_id,
        name: data.name,
        email: data.email,
        status: data.status,
        joined_room: data.joined_room
      }
    end)
  end
end
