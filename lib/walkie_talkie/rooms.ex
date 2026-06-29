defmodule WalkieTalkie.Rooms do
  import Ecto.Query
  alias WalkieTalkie.Repo
  alias WalkieTalkie.Room
  alias WalkieTalkie.RoomParticipant
  alias WalkieTalkie.RoomAccess
  alias WalkieTalkie.Message
  alias WalkieTalkie.Messages

  # Si un participante no "late" (heartbeat) en este tiempo, se asume que
  # cerró la pestaña/navegador sin avisar y se lo limpia automáticamente.
  # Con un heartbeat de 10s, esto da un margen de 3x — antes era 20s (2x),
  # que era demasiado ajustado: cualquier pequeño retraso de red hacía que
  # un participante REAL apareciera y desapareciera de la lista durante un
  # instante (justo el "parpadeo"/"recarga" que se veía en la pantalla).
  @stale_after_seconds 30

  def create_room(creator_id, attrs) do
  password = Map.get(attrs, "password", "")
  password_hash = if password != "", do: Pbkdf2.hash_pwd_salt(password), else: nil
  invite_code = generate_invite_code()

  %Room{}
  |> Room.changeset(%{
    name: Map.get(attrs, "name"),
    description: Map.get(attrs, "description"),
    is_private: Map.get(attrs, "is_private", false),
    max_participants: Map.get(attrs, "max_participants", 10),
    invite_code: invite_code,
    password_hash: password_hash,
    creator_id: creator_id,
    is_active: true
  })
  |> Repo.insert()
  |> case do
    {:ok, room} ->
      grant_permanent_access(room.id, creator_id)
      add_participant(room.id, creator_id)
      {:ok, room}
    error -> error
  end
end

defp generate_invite_code do
  :crypto.strong_rand_bytes(6) |> Base.url_encode64() |> binary_part(0, 8)
end

  @doc """
  Agrega (o re-confirma) a un usuario como participante de la sala.

  NOTA: se intentó hacer esto con un upsert atómico (INSERT ... ON
  CONFLICT), pero requiere un índice único real en la base de datos sobre
  (room_id, user_id), y tu unique_constraint/1 en el changeset no implica
  que ese índice exista — solo traduce el error si la restricción ya
  existiera. Como no está creada, se vuelve a la verificación explícita
  (ligeramente menos atómica, pero funciona sin tocar la base de datos).

  IMPORTANTE: ya NO devuelve {:error, :already_participant} cuando el
  usuario ya estaba dentro. Esto es lo que permite usar esta misma
  función como heartbeat desde el frontend sin que nunca se quede
  "atrapado" afuera por un join que antes era rechazado.
  """
  def add_participant(room_id, user_id) do
    # Otorgar acceso permanente
    grant_permanent_access(room_id, user_id)
    # Alguien confirma presencia → cancelar eliminación programada
    WalkieTalkie.RoomCleaner.cancel_cleanup(room_id)

    case Repo.get_by(RoomParticipant, room_id: room_id, user_id: user_id) do
      nil ->
        %RoomParticipant{}
        |> RoomParticipant.changeset(%{room_id: room_id, user_id: user_id, joined_at: DateTime.utc_now()})
        |> Repo.insert()
        |> case do
          {:ok, participant} ->
            WalkieTalkie.Presence.join_room(user_id, room_id)
            {:ok, participant}

          {:error, changeset} ->
            # Por si dos heartbeats casi simultáneos chocan justo aquí
            # (ventana muy pequeña): se trata como "ya estaba dentro" en
            # vez de devolver un error que bloquee al usuario.
            case Repo.get_by(RoomParticipant, room_id: room_id, user_id: user_id) do
              nil -> {:error, changeset}
              existing ->
                WalkieTalkie.Presence.join_room(user_id, room_id)
                touch_participant(existing)
                {:ok, existing}
            end
        end

      existing ->
        # Ya era participante (por ejemplo, volvió a cargar la página o
        # cerró la pestaña sin avisar y reabrió). En vez de rechazarlo,
        # se refresca su updated_at (heartbeat) y se confirma su presencia.
        WalkieTalkie.Presence.join_room(user_id, room_id)
        touch_participant(existing)
        {:ok, existing}
    end
  end

  # Actualiza updated_at del participante sin tocar el resto de campos.
  # Esto es lo que usa prune_stale_participants/1 para saber quién sigue
  # realmente conectado.
  defp touch_participant(%RoomParticipant{id: id}) do
    from(rp in RoomParticipant, where: rp.id == ^id)
    |> Repo.update_all(set: [updated_at: DateTime.utc_now()])
  end

  def remove_participant(room_id, user_id) do
  query = from rp in RoomParticipant, where: rp.room_id == ^room_id and rp.user_id == ^user_id
  case Repo.delete_all(query) do
    {1, _} ->
      WalkieTalkie.Presence.leave_room(user_id)
      # Si el usuario tenía un mensaje a medio grabar cuando salió, se
      # finaliza ahora con lo que ya se haya alcanzado a enviar al
      # servidor. Esto es lo que garantiza que nunca quede un mensaje
      # huérfano, sin importar qué haya pasado del lado del cliente
      # (cierre de pestaña, crash, etc.) — no depende de que el frontend
      # haya podido avisar nada.
      finalize_pending_messages(room_id, user_id)
      # NO ELIMINAMOS EL ACCESO PERMANENTE
      if count_participants(room_id) == 0 do
        WalkieTalkie.RoomCleaner.schedule_cleanup(room_id)
      end
      :ok
    _ -> :error
  end
end

  # Busca mensajes sin finalizar de este usuario en esta sala (debería
  # haber como mucho uno, dado el candado de grabación del frontend, pero
  # se recorren todos por si acaso) y los finaliza con los segmentos que
  # ya hayan llegado. finalize_message/1 ya maneja con elegancia el caso
  # de "sin segmentos válidos" (lo marca finalizado sin audio) y nunca
  # lanza una excepción sin capturar.
  defp finalize_pending_messages(room_id, user_id) do
    pending_ids =
      from(m in Message,
        where: m.room_id == ^room_id and m.user_id == ^user_id and m.is_finalized == false,
        select: m.id
      )
      |> Repo.all()

    Enum.each(pending_ids, fn message_id ->
      case Messages.finalize_message(message_id) do
        {:ok, _message} ->
          :ok

        {:error, reason} ->
          IO.puts(
            "WARN: no se pudo finalizar el mensaje pendiente #{message_id} del usuario #{user_id}: #{inspect(reason)}"
          )
      end
    end)
  end




  def get_room!(id), do: Repo.get!(Room, id)

  def is_participant?(room_id, user_id) do
    query = from rp in RoomParticipant, where: rp.room_id == ^room_id and rp.user_id == ^user_id
    Repo.exists?(query)
  end

  def verify_room_password(room, password) do
    if room.password_hash do
      Pbkdf2.verify_pass(password, room.password_hash)
    else
      true  # sala sin contraseña
    end
  end

  @doc """
  Devuelve los participantes de la sala. Antes de listarlos: (1) limpia a
  cualquiera que no haya mandado un heartbeat en los últimos
  @stale_after_seconds, y (2) deduplica usuarios que hayan quedado con
  más de una fila en room_participants (posible por una condición de
  carrera, ya que no hay un índice único real en la base de datos para
  (room_id, user_id) — ver nota en add_participant/2). El `distinct` en
  el select final es una segunda red de seguridad para que, aunque
  hubiera quedado algún duplicado por timing, nunca se muestre dos veces
  el mismo usuario en pantalla.
  """
  def get_participants(room_id) do
    prune_stale_participants(room_id)
    dedupe_participants(room_id)

    query =
      from rp in RoomParticipant,
        join: u in assoc(rp, :user),
        where: rp.room_id == ^room_id,
        distinct: u.id,
        select: u

    Repo.all(query)
  end

  # Limpia filas duplicadas de room_participants para el mismo
  # (room_id, user_id), dejando solo la más reciente (por updated_at).
  defp dedupe_participants(room_id) do
    duplicated_user_ids =
      from(rp in RoomParticipant,
        where: rp.room_id == ^room_id,
        group_by: rp.user_id,
        having: count(rp.id) > 1,
        select: rp.user_id
      )
      |> Repo.all()

    Enum.each(duplicated_user_ids, fn user_id ->
      ids_to_delete =
        from(rp in RoomParticipant,
          where: rp.room_id == ^room_id and rp.user_id == ^user_id,
          order_by: [desc: rp.updated_at],
          select: rp.id
        )
        |> Repo.all()
        |> Enum.drop(1)

      if ids_to_delete != [] do
        from(rp in RoomParticipant, where: rp.id in ^ids_to_delete)
        |> Repo.delete_all()
      end
    end)
  end

  defp prune_stale_participants(room_id) do
    cutoff = DateTime.utc_now() |> DateTime.add(-@stale_after_seconds, :second)

    stale_user_ids =
      from(rp in RoomParticipant,
        where: rp.room_id == ^room_id and rp.updated_at < ^cutoff,
        select: rp.user_id
      )
      |> Repo.all()

    if stale_user_ids != [] do
      from(rp in RoomParticipant, where: rp.room_id == ^room_id and rp.user_id in ^stale_user_ids)
      |> Repo.delete_all()

      Enum.each(stale_user_ids, fn user_id ->
        WalkieTalkie.Presence.leave_room(user_id)
        # Misma red de seguridad que en remove_participant: si este
        # usuario se quedó "fantasma" con un mensaje a medias (por
        # ejemplo, cerró la pestaña mientras grababa y nunca llegó el
        # finalize), se cierra ahora con lo que ya se haya enviado.
        finalize_pending_messages(room_id, user_id)
      end)

      if count_participants(room_id) == 0 do
        WalkieTalkie.RoomCleaner.schedule_cleanup(room_id)
      end
    end
  end
  ##agregar funcion para listar salas publicas(no privadas)
def list_public_rooms do
  query = from r in Room, where: r.is_private == false and r.is_active == true,
         order_by: [desc: r.inserted_at],
         limit: 10
  Repo.all(query)
end

def count_participants(room_id) do
  query = from rp in RoomParticipant, where: rp.room_id == ^room_id, select: count(rp.id)
  Repo.one(query)
end

def get_room_by_invite_code(code) do
  Repo.get_by(Room, invite_code: code, is_active: true)
end

  # Obtiene salas públicas con datos del creador (avatar, nombre)
  def list_public_rooms_with_creator do
    query = from r in Room,
      where: r.is_private == false and r.is_active == true,
      order_by: [desc: r.inserted_at],
      limit: 20,
      preload: [:creator]
    Repo.all(query)
    |> Enum.map(&room_to_map/1)
  end


  #para que los usuarios que ingresen el codigo tengan acceso permanente
  def grant_permanent_access(room_id, user_id) do
  %RoomAccess{}
  |> RoomAccess.changeset(%{room_id: room_id, user_id: user_id})
  |> Repo.insert(on_conflict: :nothing)
end

def has_permanent_access?(room_id, user_id) do
  query = from ra in RoomAccess, where: ra.room_id == ^room_id and ra.user_id == ^user_id
  Repo.exists?(query)
end

  # Obtiene salas privadas a las que el usuario tiene acceso (creador o participante)
  def list_private_rooms_for_user(user_id) do
  query = from r in Room,
    left_join: ra in RoomAccess, on: ra.room_id == r.id,
    where: r.is_private == true and r.is_active == true and (ra.user_id == ^user_id or r.creator_id == ^user_id),
    distinct: r.id,
    order_by: [desc: r.inserted_at],
    preload: [:creator]
  Repo.all(query)
end

  # Convierte una sala a mapa con los campos necesarios para el frontend
  defp room_to_map(room) do
    %{
      id: room.id,
      name: room.name,
      description: room.description,
      is_private: room.is_private,
      max_participants: room.max_participants,
      current_participants: count_participants(room.id),
      invite_code: room.invite_code,
      creator: %{
        id: room.creator.id,
        name: room.creator.name,
      }
    }
  end

end
