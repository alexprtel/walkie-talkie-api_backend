ARG ELIXIR_VERSION=1.19.5
ARG OTP_VERSION=28.5
ARG DEBIAN_VERSION=trixie-20260610-slim

ARG BUILDER_IMAGE="docker.io/hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-debian-${DEBIAN_VERSION}"
ARG RUNNER_IMAGE="docker.io/debian:${DEBIAN_VERSION}"

FROM ${BUILDER_IMAGE} AS builder

# Instalar dependencias de compilación + FFmpeg
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential git ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mix local.hex --force \
  && mix local.rebar --force

ENV MIX_ENV="prod"

COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config

COPY config/config.exs config/${MIX_ENV}.exs config/
RUN mix deps.compile

COPY priv priv
COPY lib lib

RUN mix compile

COPY config/runtime.exs config/
COPY rel rel
RUN mix release

# ===== Etapa final =====
FROM ${RUNNER_IMAGE} AS final

RUN apt-get update \
  && apt-get install -y --no-install-recommends libstdc++6 openssl libncurses6 locales ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
  && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

WORKDIR "/app"
RUN chown nobody /app

ENV MIX_ENV="prod"

COPY --from=builder --chown=nobody:root /app/_build/${MIX_ENV}/rel/walkie_talkie ./

# Crear directorios de uploads
RUN mkdir -p /app/uploads/segments /app/uploads/completed /app/uploads/temp

# ===== SCRIPT DE MIGRACIÓN Y ARRANQUE =====
RUN echo '#!/bin/bash\n\
echo "🔧 Ejecutando migraciones..."\n\
/app/bin/walkie_talkie eval "WalkieTalkie.Release.migrate()"\n\
echo "✅ Migraciones completadas. Iniciando servidor..."\n\
/app/bin/server' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

USER nobody

ENTRYPOINT ["/app/entrypoint.sh"]