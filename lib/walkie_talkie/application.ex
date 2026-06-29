defmodule WalkieTalkie.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      WalkieTalkieWeb.Telemetry,
      WalkieTalkie.Repo,
      WalkieTalkie.Presence,
      WalkieTalkie.RoomCleaner,
      {DNSCluster, query: Application.get_env(:walkie_talkie, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: WalkieTalkie.PubSub},
      {Task, fn -> clean_expired_loop() end}, #-estoy agregando
      # Start a worker by calling: WalkieTalkie.Worker.start_link(arg)
      # {WalkieTalkie.Worker, arg},
      # Start to serve requests, typically the last entry
      WalkieTalkieWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: WalkieTalkie.Supervisor]
    Supervisor.start_link(children, opts)
  end
  ##el segmento colocado
defp clean_expired_loop do
  Process.sleep(300_000)  # 1 hora (3600 segundos) en milisegundos
  count = WalkieTalkie.Messages.clean_expired_segments(5)
  IO.puts("Limpieza automática: se eliminaron #{count} segmentos viejos")
  clean_expired_loop()
end



  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    WalkieTalkieWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
