{ pkgs, ... }: {
  channel = "stable-24.05";
  packages = [
    pkgs.nodejs_20
    pkgs.jdk17
  ];
  idx.extensions = [
    "svelte.svelte-vscode"
    "vue.volar"
  ];
}
