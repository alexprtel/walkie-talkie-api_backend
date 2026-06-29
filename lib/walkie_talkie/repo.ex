defmodule WalkieTalkie.Repo do
  use Ecto.Repo,
    otp_app: :walkie_talkie,
    adapter: Ecto.Adapters.Postgres
end
