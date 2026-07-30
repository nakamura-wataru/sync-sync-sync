class SyncSyncSync < Formula
  desc "Single source of truth for MCP server configs and instruction files across AI coding tools"
  homepage "https://github.com/nakamura-wataru/sync-sync-sync"
  url "https://github.com/nakamura-wataru/sync-sync-sync/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_AFTER_TAG_IS_PUSHED"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "複数AIコーディングツール", shell_output("#{bin}/sync-sync-sync --help")
  end
end
