#!/usr/bin/env bash
# Enforce the exact Node.js release in .nvmrc.
# Node 22.23.4 bundles Corepack 0.36, which installs the pnpm build pinned by
# packageManager's sha512. Node 25+ does not ship Corepack, and Node 22.12's Corepack 0.29.4
# fails signature checks with "Cannot find matching keyid".
# Sourced by venture-install.sh and venture-test.sh.

if [ -n "${SIGNALFORGE_NODE_READY:-}" ]; then
  return 0 2>/dev/null || exit 0
fi

ensure_signalforge_node() {
  local root node_version nvmrc_version
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  node_version="22.23.4"
  nvmrc_version="$(tr -d '[:space:]' < "${root}/.nvmrc")"
  if [ "$nvmrc_version" != "$node_version" ]; then
    echo "error: .nvmrc pins '${nvmrc_version}', but these scripts only trust Node ${node_version}." >&2
    exit 1
  fi

  local node_bin_dir=""
  if node_bin_dir="$(find_pinned_node_on_path "$node_version")"; then
    echo "ensure-node: using Node v${node_version} at ${node_bin_dir}"
  else
    explain_node_mismatch "$node_version"
    local prefix="${HOME}/.local/node-v${node_version}"
    if pinned_node_prefix_ok "$prefix" "$node_version"; then
      node_bin_dir="${prefix}/bin"
      echo "ensure-node: using cached Node v${node_version} at ${node_bin_dir}"
    else
      node_bin_dir="$(install_pinned_node "$node_version" "$prefix")"
      echo "ensure-node: installed Node v${node_version} at ${node_bin_dir}"
    fi
  fi

  if [ ! -x "${node_bin_dir}/node" ] || [ ! -x "${node_bin_dir}/corepack" ]; then
    echo "error: Node v${node_version} at ${node_bin_dir} has no bundled corepack." >&2
    exit 1
  fi
  local actual
  actual="$("${node_bin_dir}/node" -v 2>/dev/null || true)"
  if [ "$actual" != "v${node_version}" ]; then
    echo "error: Node at ${node_bin_dir} reports '${actual}', not v${node_version}." >&2
    exit 1
  fi

  mkdir -p "${HOME}/.local/bin"
  export SIGNALFORGE_NODE_BIN="$node_bin_dir"
  export PATH="${node_bin_dir}:${HOME}/.local/bin:${PATH}"
  hash -r
  export SIGNALFORGE_NODE_READY=1
}

find_pinned_node_on_path() {
  local node_version="$1"
  local IFS=':'
  local -a entries=()
  local dir actual
  read -r -a entries <<< "${PATH}"
  for dir in "${entries[@]}"; do
    [ -n "$dir" ] || continue
    [ -x "${dir}/node" ] || continue
    [ -x "${dir}/corepack" ] || continue
    actual="$("${dir}/node" -v 2>/dev/null || true)"
    if [ "$actual" = "v${node_version}" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done
  return 1
}

pinned_node_prefix_ok() {
  local prefix="$1"
  local node_version="$2"
  [ -x "${prefix}/bin/node" ] && [ -x "${prefix}/bin/corepack" ] || return 1
  [ "$("${prefix}/bin/node" -v 2>/dev/null || true)" = "v${node_version}" ]
}

explain_node_mismatch() {
  local node_version="$1"
  local found="" node_path=""
  if command -v node >/dev/null 2>&1; then
    node_path="$(command -v node)"
    found="$("$node_path" -v 2>/dev/null || true)"
  fi
  if [ -z "$found" ]; then
    echo "ensure-node: Node.js is not on PATH. .nvmrc requires ${node_version}. Downloading the pinned release."
  elif [ "$found" = "v${node_version}" ]; then
    echo "ensure-node: Node ${found} at ${node_path} has no bundled corepack. Downloading the official ${node_version} release."
  else
    echo "ensure-node: Node ${found} is unsupported. .nvmrc requires ${node_version}. Downloading the pinned release."
  fi
}

install_pinned_node() {
  local node_version="$1"
  local prefix="$2"
  local os arch tarball pinned_tarball
  os="$(uname -s)"
  if [ "$os" != "Linux" ]; then
    echo "error: automatic Node.js install supports Linux only (this host is ${os}). Install Node ${node_version} and retry." >&2
    exit 1
  fi
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      echo "error: unsupported architecture ${arch}." >&2
      exit 1
      ;;
  esac

  # Digests from https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
  # The file digest is pinned so a replaced checksum list cannot bless another tarball.
  local shasums_digest="c90c3f1478fda8308b22cc1a1b0dc536169196444e67ee8b5c582fd351d02bce"
  case "$arch" in
    x64) pinned_tarball="1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce" ;;
    arm64) pinned_tarball="6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b" ;;
  esac
  tarball="node-v${node_version}-linux-${arch}.tar.xz"

  command -v curl >/dev/null 2>&1 || {
    echo "error: curl is required to download Node.js ${node_version}." >&2
    exit 1
  }
  command -v sha256sum >/dev/null 2>&1 || {
    echo "error: sha256sum is required to verify Node.js ${node_version}." >&2
    exit 1
  }
  command -v tar >/dev/null 2>&1 || {
    echo "error: tar is required to extract Node.js ${node_version}." >&2
    exit 1
  }
  command -v xz >/dev/null 2>&1 || {
    echo "error: xz is required to extract Node.js ${node_version}." >&2
    exit 1
  }

  local workdir sums_path tarball_path sums_hash listed tarball_hash
  workdir="$(mktemp -d)"
  sums_path="${workdir}/SHASUMS256.txt"
  tarball_path="${workdir}/${tarball}"
  curl -fsSL --retry 3 --retry-delay 2 -o "$sums_path" "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
  sums_hash="$(sha256sum "$sums_path" | awk '{print $1}')"
  if [ "$sums_hash" != "$shasums_digest" ]; then
    rm -rf "$workdir"
    echo "error: SHASUMS256.txt digest mismatch for Node ${node_version}." >&2
    echo "expected ${shasums_digest}" >&2
    echo "got      ${sums_hash}" >&2
    exit 1
  fi
  curl -fsSL --retry 3 --retry-delay 2 -o "$tarball_path" "https://nodejs.org/dist/v${node_version}/${tarball}"
  tarball_hash="$(sha256sum "$tarball_path" | awk '{print $1}')"
  listed="$(awk -v name="$tarball" '$2 == name { print $1; exit }' "$sums_path")"
  if [ "$listed" != "$pinned_tarball" ] || [ "$tarball_hash" != "$pinned_tarball" ]; then
    rm -rf "$workdir"
    echo "error: Node.js tarball digest mismatch for ${tarball}." >&2
    echo "pinned  ${pinned_tarball}" >&2
    echo "listed  ${listed:-missing}" >&2
    echo "actual  ${tarball_hash}" >&2
    exit 1
  fi
  echo "ensure-node: verified ${tarball} against SHASUMS256.txt and the pinned digest." >&2

  rm -rf "$prefix"
  mkdir -p "$prefix"
  tar -xJf "$tarball_path" -C "$prefix" --strip-components=1
  rm -rf "$workdir"
  printf '%s\n' "${prefix}/bin"
}

ensure_signalforge_node
