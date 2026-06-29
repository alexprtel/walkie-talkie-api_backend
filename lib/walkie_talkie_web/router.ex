defmodule WalkieTalkieWeb.Router do
  use WalkieTalkieWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
    plug :fetch_session
  end

  pipeline :auth do
    plug :accepts, ["json"]
    plug :fetch_session
    plug :fetch_current_user
  end

  defp fetch_current_user(conn, _opts) do
    token = List.first(Plug.Conn.get_req_header(conn, "authorization"))
    token = if token, do: String.replace_prefix(token, "Bearer ", ""), else: nil

    if token do
      user = WalkieTalkie.Guardian.get_user_from_token(token)
      assign(conn, :current_user, user)
    else
      assign(conn, :current_user, nil)
    end
  end

  scope "/api", WalkieTalkieWeb do
    pipe_through :api

    post "/auth/register", AuthController, :register
    post "/auth/login", AuthController, :login
  end

  scope "/api", WalkieTalkieWeb do
    pipe_through [:api, :auth]
    post "/audio-rooms", RoomController, :create
    post "/audio-rooms/:room_id/join", RoomController, :join
    get "/audio-rooms/:room_id/participants", RoomController, :participants
    get "/me", AuthController, :me
    post "/audio-rooms/:room_id/messages", MessageController, :start
    post "/messages/:message_id/segments", MessageController, :add_segment
    post "/messages/:message_id/finalize", MessageController, :finalize
    get "/audio-rooms/:room_id/segments", MessageController, :poll_segments
    get "/audio-segments/:segment_id/file", MessageController, :download_segment
    get "/messages/:message_id/audio", MessageController, :download_completed_audio
    #Para que figure los mensajes
    get "/audio-rooms/:room_id/messages", MessageController, :history
    #Caracteristicas de salas
    get "/audio-rooms", RoomController, :index
    #para eliminacion de forma manual
    delete "/audio-rooms/:room_id/segments/expired", MessageController, :clean_expired

    #para cerar sesion

    post "/auth/logout", AuthController, :logout
    ##estado
    get "/online-users", UserController, :online_users

    post "/audio-rooms/:room_id/leave", RoomController, :leave

    #para google
    post "/auth/google", AuthController, :google_login

    #para actulizar perfil
    put "/user/profile", UserController, :update_profile
    post "/user/avatar", UserController, :upload_avatar

    #para la visualzacion de las salas
    get "/audio-rooms/public", RoomController, :public_rooms
    get "/audio-rooms/private", RoomController, :private_rooms

    #para el codigo de invitacion
    get "/audio-rooms/by-code/:code", RoomController, :show_by_code

    get "/audio-rooms/:id", RoomController, :show

  end
end
