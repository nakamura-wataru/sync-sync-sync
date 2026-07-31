class SyncSyncSync < Formula
  desc "Single source of truth for MCP server configs and instruction files across AI coding tools"
  homepage "https://github.com/nakamura-wataru/sync-sync-sync"
  url "https://github.com/nakamura-wataru/sync-sync-sync/archive/refs/tags/v0.1.1.tar.gz"
  sha256 "2535e8659794dc99a782f003137c3048645e76253331e8895a0416881c0b1877"

  depends_on "node"

  def install
    # The release tarball ships source only (dist/ is gitignored), so build it here
    # rather than relying on `npm install --global`, which skips devDependencies
    # (tsup, typescript) and would leave the "prepare" build script unable to run.
    system "npm", "install"
    system "npm", "run", "build"
    system "npm", "prune", "--omit=dev"
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli.js" => "sync-sync-sync"
  end

  test do
    assert_match "複数AIコーディングツール", shell_output("#{bin}/sync-sync-sync --help")
  end
end
