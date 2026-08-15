# The sandbox this project's agents run in.
#
# `ai-base` ships `qm-sandbox-local:latest` with python3 and pip but no numeric
# stack, so an agent asking to run a sweep gets an ImportError. This image adds
# the stack and nothing else.
#
# Derived rather than patched: `ai-base/` is a subtree that stays byte-identical
# to upstream, and the kernel already exposes the knob — `LOCAL_SANDBOX_IMAGE`
# selects the image, so a project can bring its own without touching the base.
#
#   DOCKER_BUILDKIT=0 docker build -t coclea-sandbox:latest projects/coclea-sr/sandbox
#
# DOCKER_BUILDKIT=0 is required and is not superstition: buildkit resolves the
# FROM against a registry even when the image is already in the local store, so
# it fails with "pull access denied" on an image that is sitting right there.
# The legacy builder looks locally first.
#   LOCAL_SANDBOX_IMAGE=coclea-sandbox:latest  # in ai-base/.env
#
# KNOWN COST, measured rather than assumed: the upstream base is linux/amd64 and
# this host is arm64, so everything here runs under emulation. See
# `sandbox/README.md` for the measured penalty and what it means for what an
# agent should be asked to run.
ARG BASE=qm-sandbox-local:latest
FROM ${BASE}

# --break-system-packages: the base is Debian bookworm with PEP-668 marking the
# system Python as externally managed. A venv would be cleaner and is the wrong
# choice here: the agent's shell starts fresh every turn and would have to
# remember to activate it, so a turn that forgot would fail with an ImportError
# that looks like a missing dependency rather than a missing `source`.
RUN pip3 install --no-cache-dir --break-system-packages \
      numpy scipy sympy mpmath pytest matplotlib \
 && python3 -c "import numpy, scipy, sympy, mpmath, matplotlib; print('numeric stack ok')"

# Where the read-only project layer lands, so an agent can `cd` there by habit.
ENV COCLEA_PROJECT=/root/global/coclea-sr
