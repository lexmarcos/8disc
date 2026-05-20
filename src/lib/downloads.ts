export type DesktopPlatform = 'windows' | 'linux';

export type DesktopDownloadOption = {
  platform: DesktopPlatform;
  href: string;
};

type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  assets: GitHubReleaseAsset[];
};

export const desktopDownloadOptions: DesktopDownloadOption[] = [
  {
    platform: 'windows',
    href: 'https://github.com/lexmarcos/8disc/releases/latest'
  },
  {
    platform: 'linux',
    href: 'https://github.com/lexmarcos/8disc/releases/latest'
  }
];

const latestReleaseApiUrl = 'https://api.github.com/repos/lexmarcos/8disc/releases/latest';

const assetMatchers: Record<DesktopPlatform, RegExp[]> = {
  windows: [/windows.*x64.*\.zip$/i, /win.*x64.*\.zip$/i, /\.(msi|exe)$/i],
  linux: [/linux.*x64.*\.zip$/i, /\.appimage$/i, /\.deb$/i]
};

function findAsset(assets: GitHubReleaseAsset[], platform: DesktopPlatform) {
  for (const matcher of assetMatchers[platform]) {
    const asset = assets.find(({ name }) => matcher.test(name));

    if (asset) return asset;
  }

  return null;
}

export async function resolveLatestDesktopDownloads(
  fetchRelease: typeof fetch = fetch
): Promise<DesktopDownloadOption[]> {
  const response = await fetchRelease(latestReleaseApiUrl, {
    headers: { Accept: 'application/vnd.github+json' }
  });

  if (!response.ok) {
    throw new Error(`GitHub release request failed with ${response.status}`);
  }

  const release = (await response.json()) as GitHubRelease;

  return desktopDownloadOptions.map((option) => {
    const asset = findAsset(release.assets ?? [], option.platform);

    return asset ? { ...option, href: asset.browser_download_url } : option;
  });
}
