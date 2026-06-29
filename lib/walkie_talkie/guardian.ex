defmodule WalkieTalkie.Guardian do
  @secret "MI_SECRETO_SUPER_SECRETO_CAMBIAR_EN_PRODUCCION"

  def generate_token(user) do
    signer = Joken.Signer.create("HS256", @secret)
    claims = %{
      "user_id" => user.id,
      "email" => user.email,
      "exp" => Joken.current_time() + 7 * 24 * 3600
    }
    case Joken.encode_and_sign(claims, signer) do
      {:ok, token, _} -> {:ok, token}
      error -> error
    end
  end

  def verify_token(token) do
    signer = Joken.Signer.create("HS256", @secret)
    case Joken.verify(token, signer) do
      {:ok, claims} -> {:ok, claims}
      error -> error
    end
  end

  def get_user_from_token(token) do
    case verify_token(token) do
      {:ok, claims} -> WalkieTalkie.Accounts.get_user!(claims["user_id"])
      _ -> nil
    end
  end
end
