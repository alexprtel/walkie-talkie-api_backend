defmodule WalkieTalkie.RoomCleaner do
  use GenServer
  import Ecto.Query
  alias WalkieTalkie.Repo
  alias WalkieTalkie.Room
  alias WalkieTalkie.RoomParticipant

  # Inicio del GenServer
  def start_link(_) do
    GenServer.start_link(__MODULE__, %{}, name: __MODULE__)
  end

  def init(state) do
    {:ok, state}
  end

  # ========== API ==========
  def schedule_cleanup(room_id) do
    GenServer.cast(__MODULE__, {:schedule, room_id})
  end

  def cancel_cleanup(room_id) do
    GenServer.cast(__MODULE__, {:cancel, room_id})
  end

  # ========== HANDLERS ==========
  def handle_cast({:schedule, room_id}, state) do
    # Si ya existe un timer para esta sala, lo cancelamos primero
    case Map.get(state, room_id) do
      nil -> :ok
      timer_ref -> Process.cancel_timer(timer_ref)
    end

    # Programamos la eliminación después de 1 hora (3600 segundos)
    timer_ref = Process.send_after(self(), {:delete_room, room_id}, 1800 * 1000)
    {:noreply, Map.put(state, room_id, timer_ref)}
  end

  def handle_cast({:cancel, room_id}, state) do
    case Map.get(state, room_id) do
      nil -> {:noreply, state}
      timer_ref ->
        Process.cancel_timer(timer_ref)
        {:noreply, Map.delete(state, room_id)}
    end
  end

  def handle_info({:delete_room, room_id}, state) do
    # Eliminar la sala de la base de datos
    case Repo.get(Room, room_id) do
      nil -> :ok
      room ->
        # Primero eliminar participantes
        Repo.delete_all(from rp in RoomParticipant, where: rp.room_id == ^room_id)
        # Luego eliminar la sala
        Repo.delete(room)
        IO.puts("🗑️ Sala #{room_id} eliminada por inactividad")
    end
    {:noreply, Map.delete(state, room_id)}
  end
end
