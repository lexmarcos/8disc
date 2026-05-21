<script lang="ts">
  import { browser } from '$app/environment';
  import {
    desktopDownloadOptions as defaultDesktopDownloadOptions,
    resolveLatestDesktopDownloads,
    type DesktopDownloadOption
  } from '$lib/downloads';
  import {
    absoluteUrl,
    localizedPages,
    ogImageHeight,
    ogImagePath,
    ogImageType,
    ogImageWidth,
    siteName,
    xDefaultPath
  } from '$lib/seo';
  import { onDestroy, onMount } from 'svelte';
  import type { FFmpeg as FFmpegInstance } from '@ffmpeg/ffmpeg';

  type PageMode = 'standard' | 'advanced';
  type TargetSize = 8 | 16 | 25 | 50 | 100;
  type FfmpegCorePreference = 'auto' | 'single' | 'multi';
  type LoadedFfmpegCore = 'single' | 'multi';
  type H264Preset = 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast' | 'medium';
  type H264Profile = 'auto' | 'baseline' | 'main' | 'high';
  type H264VideoProfile = Exclude<H264Profile, 'auto'>;
  type PixelFormat = 'yuv420p' | 'yuv444p';
  type FetchFile = (source: string | File | Blob) => Promise<Uint8Array>;
  type VideoInfo = {
    duration: number;
    width: number;
    height: number;
  };
  type DesktopVideo = VideoInfo & {
    path: string;
    name: string;
    size: number;
  };
  type EncodePlan = {
    videoKbps: number;
    audioKbps: number;
    width: number | null;
    height: number | null;
    preset?: H264Preset | null;
    threads?: number | null;
    useFastStart?: boolean;
    videoProfile?: H264VideoProfile | null;
    h264Level?: string | null;
    stripMetadata?: boolean;
    audioChannels?: number;
    audioSampleRate?: number;
    pixelFormat?: PixelFormat;
  };
  type EncodeProfile = {
    maxLongEdge?: number;
    maxVideoKbps?: number;
    videoKbps?: number | null;
    audioKbps?: number;
    preset?: H264Preset;
    threads?: number | null;
    useFastStart?: boolean;
    videoProfile?: H264VideoProfile | null;
    h264Level?: string | null;
    stripMetadata?: boolean;
    audioChannels?: number;
    audioSampleRate?: number;
    pixelFormat?: PixelFormat;
  };
  type WebEncodeProfile = EncodeProfile & {
    isIOS: boolean;
    isMobile: boolean;
    maxLongEdge: number;
    maxVideoKbps: number;
    preset: H264Preset;
    threads: number | null;
    useFastStart: boolean;
    videoProfile: H264VideoProfile | null;
    h264Level: string | null;
    stripMetadata: boolean;
    audioChannels: number;
    audioSampleRate: number;
    pixelFormat: PixelFormat;
  };
  type FfmpegLoadConfig = {
    coreURL: string;
    wasmURL: string;
    workerURL?: string;
  };
  type DesktopCompressionProgress = {
    jobId: string;
    percent: number;
    status: StatusKey;
    encoder: string;
  };
  type DesktopCompressionResult = {
    outputPath: string;
    outputSize: number;
    encoder: string;
  };
  type ResizeDirection =
    | 'East'
    | 'North'
    | 'NorthEast'
    | 'NorthWest'
    | 'South'
    | 'SouthEast'
    | 'SouthWest'
    | 'West';
  type ResizeHandle = {
    direction: ResizeDirection;
    className: string;
  };
  type FFmpegConstructor = new () => FFmpegInstance;
  type AudioContextConstructor = new () => AudioContext;

  const translations = {
    en: {
      htmlLang: 'en',
      metaTitle: '8disc - Compress Video to 8MB for Discord',
      metaDescription:
        'Compress MP4, MOV, MKV, WebM and other videos locally to 8 MB, 16 MB, 25 MB, 50 MB or 100 MB for Discord. Private, fast and no uploads.',
      ogTitle: '8disc - Local Discord video compressor',
      ogDescription:
        'Shrink videos in your browser or desktop app to Discord-friendly sizes without uploading files.',
      structuredFeatures: [
        'Local browser video compression',
        'Desktop compression with native FFmpeg',
        'Discord-friendly target sizes',
        'Private processing with no server upload'
      ],
      headerMeta: 'local / wasm / mp4',
      desktopHeaderMeta: 'local / gpu / mp4',
      languageLabel: 'Language',
      downloadApp: 'Download app',
      downloadMenuLabel: 'App downloads',
      downloadWindows: 'Windows',
      downloadLinux: 'Linux',
      advancedMode: 'Advanced',
      simpleMode: 'Simple',
      eyebrow: 'local compressor',
      headline: 'Compress to fit on Discord',
      uploadAria: 'Video upload',
      uploadTitle: 'Drop or select a video',
      uploadSubtitle: 'Everything runs in your browser.',
      targetAria: 'Output size',
      megabytes: 'MB',
      compress: 'Compress',
      compressing: 'Compressing',
      download: 'Download',
      advanced: {
        settings: 'Advanced settings',
        target: 'Target',
        outputName: 'Output name',
        outputPlaceholder: 'auto from input',
        webEngine: 'Web FFmpeg',
        engineAuto: 'Auto',
        engineSingle: 'WASM',
        engineMulti: 'WASM MT',
        preset: 'Preset',
        profile: 'Profile',
        auto: 'Auto',
        videoKbps: 'Video kbps',
        audioKbps: 'Audio kbps',
        maxEdge: 'Max edge',
        threads: 'Threads',
        fastStart: 'Fast start',
        stripMetadata: 'Strip metadata'
      },
      alreadyBelowTarget: (target: number) =>
        `This video is already smaller than ${target} MB, so it cannot be compressed for this target. Choose a smaller target.`,
      createdBy: 'Created by Markzuel',
      social: {
        github: 'Markzuel on GitHub',
        instagram: 'Markzuel on Instagram',
        x: 'Markzuel on X',
        linkedin: 'Markzuel on LinkedIn'
      },
      status: {
        chooseVideo: 'Choose a video',
        readingMetadata: 'Reading metadata',
        ready: 'Ready to compress',
        preparingFfmpeg: 'Preparing FFmpeg',
        loadingFfmpeg: 'Loading FFmpeg',
        calculating: 'Calculating compression',
        selectingOutput: 'Choose output file',
        detectingEncoder: 'Detecting encoder',
        usingGpuEncoder: 'Using GPU encoder',
        usingCpuFallback: 'Using CPU fallback',
        compressingLocal: 'Compressing locally',
        fileReady: 'File ready',
        fileReadyOversized: 'File ready, above target',
        compressionFailed: 'Compression failed'
      },
      errors: {
        invalidFile: 'Upload a video file.',
        fileTooLarge:
          'This video is too large for browser compression. On iOS, use a smaller file or the desktop app.',
        readerFailed: 'Could not load the file reader.',
        invalidOutput:
          'This browser returned an invalid video file. On iOS, try a shorter or lower-resolution video.',
        compressFailed: 'Could not compress this video.'
      },
      loadingProgress: (value: number) => `Loading FFmpeg ${value}%`,
      progress: (value: number) => `Compressing ${value}%`
    },
    pt: {
      htmlLang: 'pt-BR',
      metaTitle: '8disc - Comprimir vídeo para 8 MB no Discord',
      metaDescription:
        'Comprima MP4, MOV, MKV, WebM e outros vídeos localmente para 8 MB, 16 MB, 25 MB, 50 MB ou 100 MB no Discord. Privado, rápido e sem upload.',
      ogTitle: '8disc - Compressor local de vídeo para Discord',
      ogDescription:
        'Reduza vídeos no navegador ou app desktop para tamanhos compatíveis com o Discord sem enviar arquivos para servidores.',
      structuredFeatures: [
        'Compressão local de vídeo no navegador',
        'Compressão desktop com FFmpeg nativo',
        'Tamanhos finais compatíveis com o Discord',
        'Processamento privado sem upload para servidor'
      ],
      headerMeta: 'local / wasm / mp4',
      desktopHeaderMeta: 'local / gpu / mp4',
      languageLabel: 'Idioma',
      downloadApp: 'Baixar app',
      downloadMenuLabel: 'Downloads do app',
      downloadWindows: 'Windows',
      downloadLinux: 'Linux',
      advancedMode: 'Avancado',
      simpleMode: 'Simples',
      eyebrow: 'compressor local',
      headline: 'Comprima para caber no Discord',
      uploadAria: 'Upload de video',
      uploadTitle: 'Arraste ou selecione um video',
      uploadSubtitle: 'Tudo roda no seu navegador.',
      targetAria: 'Tamanho final',
      megabytes: 'MB',
      compress: 'Comprimir',
      compressing: 'Comprimindo',
      download: 'Baixar',
      advanced: {
        settings: 'Configuracoes avancadas',
        target: 'Meta',
        outputName: 'Nome do arquivo',
        outputPlaceholder: 'automatico pelo video',
        webEngine: 'FFmpeg web',
        engineAuto: 'Auto',
        engineSingle: 'WASM',
        engineMulti: 'WASM MT',
        preset: 'Preset',
        profile: 'Profile',
        auto: 'Auto',
        videoKbps: 'Video kbps',
        audioKbps: 'Audio kbps',
        maxEdge: 'Lado maximo',
        threads: 'Threads',
        fastStart: 'Fast start',
        stripMetadata: 'Remover metadados'
      },
      alreadyBelowTarget: (target: number) =>
        `Este video ja esta menor que ${target} MB, entao nao e possivel comprimir para esse alvo. Escolha um alvo menor.`,
      createdBy: 'Criado por Markzuel',
      social: {
        github: 'Markzuel no GitHub',
        instagram: 'Markzuel no Instagram',
        x: 'Markzuel no X',
        linkedin: 'Markzuel no LinkedIn'
      },
      status: {
        chooseVideo: 'Escolha um video',
        readingMetadata: 'Lendo metadados',
        ready: 'Pronto para comprimir',
        preparingFfmpeg: 'Preparando FFmpeg',
        loadingFfmpeg: 'Carregando FFmpeg',
        calculating: 'Calculando compressao',
        selectingOutput: 'Escolha o arquivo final',
        detectingEncoder: 'Detectando encoder',
        usingGpuEncoder: 'Usando encoder da GPU',
        usingCpuFallback: 'Usando fallback na CPU',
        compressingLocal: 'Comprimindo localmente',
        fileReady: 'Arquivo pronto',
        fileReadyOversized: 'Arquivo pronto, acima da meta',
        compressionFailed: 'Falha na compressao'
      },
      errors: {
        invalidFile: 'Envie um arquivo de video.',
        fileTooLarge:
          'Este video e grande demais para compressao no navegador. No iOS, use um arquivo menor ou o app desktop.',
        readerFailed: 'Nao foi possivel carregar o leitor de arquivos.',
        invalidOutput:
          'Este navegador retornou um video invalido. No iOS, tente um video mais curto ou com menor resolucao.',
        compressFailed: 'Nao foi possivel comprimir o video.'
      },
      loadingProgress: (value: number) => `Carregando FFmpeg ${value}%`,
      progress: (value: number) => `Comprimindo ${value}%`
    }
  } as const;

  type Locale = keyof typeof translations;
  type StatusKey = keyof (typeof translations)['en']['status'];
  type ErrorKey = keyof (typeof translations)['en']['errors'];
  type Translation = (typeof translations)[Locale];

  let {
    initialLocale = 'en',
    canonicalPath = '/',
    mode = 'standard'
  }: { initialLocale?: Locale; canonicalPath?: string; mode?: PageMode } = $props();

  const targetSizes = [8, 16, 25, 50, 100] as const;
  const standardLanguageOptions = [
    { code: 'en', label: 'EN', href: '/', hreflang: 'en' },
    { code: 'pt', label: 'PT', href: '/pt/', hreflang: 'pt-BR' }
  ] as const;
  const advancedLanguageOptions = [
    { code: 'en', label: 'EN', href: '/advanced/', hreflang: 'en' },
    { code: 'pt', label: 'PT', href: '/pt/advanced/', hreflang: 'pt-BR' }
  ] as const;
  const advancedLocalizedPages = [
    { locale: 'en', hreflang: 'en', path: '/advanced/', label: 'English' },
    { locale: 'pt', hreflang: 'pt-BR', path: '/pt/advanced/', label: 'Portugues' }
  ] as const;
  const sameAsLinks = [
    'https://github.com/lexmarcos',
    'https://www.instagram.com/markzuel/',
    'https://x.com/mark_zuel',
    'https://www.linkedin.com/in/marcosuelfilho/'
  ];
  const MB = 1024 * 1024;
  const MAX_INPUT_BYTES = 2 * 1024 * MB;
  const IOS_MAX_INPUT_BYTES = 180 * MB;
  const TARGET_BITRATE_UTILIZATION = 0.97;
  const MIN_VIDEO_KBPS = 80;
  const MOBILE_MAX_VIDEO_KBPS = 6000;
  const MIN_VALID_MP4_BYTES = 1024;
  const FFMPEG_LOAD_TIMEOUT_MS = 20_000;
  const videoExtensions = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
  const resizeHandles: ResizeHandle[] = [
    { direction: 'North', className: 'absolute inset-x-3 top-0 z-40 h-1 cursor-n-resize' },
    { direction: 'South', className: 'absolute inset-x-3 bottom-0 z-40 h-1 cursor-s-resize' },
    { direction: 'West', className: 'absolute inset-y-3 left-0 z-40 w-1 cursor-w-resize' },
    { direction: 'East', className: 'absolute inset-y-3 right-0 z-40 w-1 cursor-e-resize' },
    { direction: 'NorthWest', className: 'absolute left-0 top-0 z-40 size-3 cursor-nw-resize' },
    { direction: 'NorthEast', className: 'absolute right-0 top-0 z-40 size-3 cursor-ne-resize' },
    { direction: 'SouthWest', className: 'absolute bottom-0 left-0 z-40 size-3 cursor-sw-resize' },
    { direction: 'SouthEast', className: 'absolute bottom-0 right-0 z-40 size-3 cursor-se-resize' }
  ];
  const RESOLUTION_TIERS = [
    { longEdge: 3840, minVideoKbps: 12000 },
    { longEdge: 2560, minVideoKbps: 7000 },
    { longEdge: 1920, minVideoKbps: 3500 },
    { longEdge: 1280, minVideoKbps: 1400 },
    { longEdge: 854, minVideoKbps: 700 }
  ] as const;
  const presetOptions: H264Preset[] = ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium'];
  const profileOptions: H264Profile[] = ['auto', 'baseline', 'main', 'high'];

  let selectedLocale = $state<Locale | null>(null);
  let locale = $derived(selectedLocale ?? initialLocale);
  let selectedTarget = $state<TargetSize>(8);
  let advancedTargetMb = $state(8);
  let advancedOutputName = $state('');
  let advancedFfmpegCore = $state<FfmpegCorePreference>('auto');
  let advancedPreset = $state<H264Preset>('veryfast');
  let advancedH264Profile = $state<H264Profile>('auto');
  let advancedVideoKbps = $state(0);
  let advancedAudioKbps = $state(64);
  let advancedMaxLongEdge = $state(0);
  let advancedThreads = $state(0);
  let advancedFastStart = $state(true);
  let advancedStripMetadata = $state(true);
  let isDesktop = $state(isTauriRuntime());
  let videoFile = $state<File | null>(null);
  let desktopVideo = $state<DesktopVideo | null>(null);
  let videoInfo = $state<VideoInfo | null>(null);
  let fileInput = $state<HTMLInputElement | undefined>();
  let ffmpeg: FFmpegInstance | null = null;
  let fetchFile: FetchFile | null = null;
  let loadedFfmpegCore: LoadedFfmpegCore | null = null;

  let isDragging = $state(false);
  let isLoadingEngine = $state(false);
  let isCompressing = $state(false);
  let compressionRequestLocked = $state(false);
  let progress = $state(0);
  let engineLoadProgress = $state(0);
  let engineLoadTimer: number | null = null;
  let statusKey = $state<StatusKey>('chooseVideo');
  let errorKey = $state<ErrorKey | ''>('');
  let compressedUrl = $state('');
  let compressedName = $state('compressed-video.mp4');
  let compressedSize = $state(0);
  let desktopOutputPath = $state('');
  let activeEncoder = $state('');
  let errorDetail = $state('');
  let ffmpegLogLines = $state<string[]>([]);
  let downloadMenuOpen = $state(false);
  let downloadMenuElement = $state<HTMLDivElement | undefined>();
  let desktopDownloadOptions = $state<DesktopDownloadOption[]>(defaultDesktopDownloadOptions);
  let notificationAudioContext: AudioContext | null = null;

  let text = $derived(translations[locale]);
  let isAdvancedMode = $derived(mode === 'advanced');
  let languageOptions = $derived(isAdvancedMode ? advancedLanguageOptions : standardLanguageOptions);
  let currentLocalizedPages = $derived(isAdvancedMode ? advancedLocalizedPages : localizedPages);
  let currentXDefaultPath = $derived(isAdvancedMode ? '/advanced/' : xDefaultPath);
  let alternateLinks = $derived([
    ...currentLocalizedPages.map(({ hreflang, path }) => ({ hreflang, href: absoluteUrl(path) })),
    { hreflang: 'x-default', href: absoluteUrl(currentXDefaultPath) }
  ]);
  let modeHref = $derived(
    isAdvancedMode ? (locale === 'pt' ? '/pt/' : '/') : locale === 'pt' ? '/pt/advanced/' : '/advanced/'
  );
  let pageUrl = $derived(absoluteUrl(canonicalPath));
  let ogImageUrl = $derived(absoluteUrl(ogImagePath));
  let structuredData = $derived(createStructuredData(text, pageUrl, ogImageUrl));
  let selectedVideoName = $derived(desktopVideo?.name ?? videoFile?.name ?? '');
  let selectedVideoSize = $derived(desktopVideo?.size ?? videoFile?.size ?? 0);
  let hasSelectedVideo = $derived(Boolean(desktopVideo || videoFile));
  let effectiveTargetMb = $derived(isAdvancedMode ? normalizeTargetMb(advancedTargetMb) : selectedTarget);
  let targetBytes = $derived(effectiveTargetMb * MB);
  let isVideoAtOrBelowTarget = $derived(
    hasSelectedVideo && selectedVideoSize > 0 && selectedVideoSize <= targetBytes
  );
  let canCompress = $derived(
    hasSelectedVideo &&
    !isVideoAtOrBelowTarget &&
    !errorKey &&
    !isLoadingEngine &&
    !isCompressing &&
    !compressionRequestLocked
  );
  let inputSize = $derived(selectedVideoSize ? formatBytes(selectedVideoSize) : '');
  let outputSize = $derived(compressedSize ? formatBytes(compressedSize) : '');
  let engineLabel = $derived(
    isLoadingEngine
      ? text.loadingProgress(engineLoadProgress)
      : isCompressing && progress > 0
        ? text.progress(progress)
        : text.status[statusKey]
  );
  let engineDetail = $derived(activeEncoder ? `${engineLabel} / ${activeEncoder}` : engineLabel);
  let progressBarValue = $derived(isLoadingEngine
    ? engineLoadProgress
    : isCompressing || progress === 100
      ? progress
      : 0
  );
  let progressRightLabel = $derived(isLoadingEngine
    ? `${engineLoadProgress}%`
    : `${formatTargetValue(effectiveTargetMb)} ${text.megabytes}`
  );
  let errorText = $derived(errorKey ? text.errors[errorKey] : '');

  onMount(() => {
    isDesktop = isTauriRuntime();
    void refreshDesktopDownloadOptions();

    if (initialLocale !== 'en') {
      applyLocale(initialLocale);
      localStorage.setItem('8disc:locale', initialLocale);
      return;
    }

    const savedLocale = localStorage.getItem('8disc:locale');

    if (isLocale(savedLocale)) {
      applyLocale(savedLocale);
    } else {
      applyLocale(detectDeviceLocale());
    }
  });

  async function refreshDesktopDownloadOptions() {
    try {
      desktopDownloadOptions = await resolveLatestDesktopDownloads();
    } catch (error) {
      console.warn('Could not resolve latest desktop downloads', error);
    }
  }

  onDestroy(() => {
    clearCompressedOutput();
    stopEngineLoadProgress();

    if (notificationAudioContext) {
      void notificationAudioContext.close();
    }
  });

  function setLocale(nextLocale: Locale) {
    applyLocale(nextLocale);
    localStorage.setItem('8disc:locale', nextLocale);
  }

  function toggleDownloadMenu(event: MouseEvent) {
    event.stopPropagation();
    downloadMenuOpen = !downloadMenuOpen;
  }

  function closeDownloadMenu() {
    downloadMenuOpen = false;
  }

  function handleWindowClick(event: MouseEvent) {
    const target = event.target;

    if (!downloadMenuOpen || !(target instanceof Node)) return;
    if (!downloadMenuElement?.contains(target)) closeDownloadMenu();
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeDownloadMenu();
    }
  }

  function applyLocale(nextLocale: Locale) {
    selectedLocale = nextLocale;

    if (browser) {
      document.documentElement.lang = translations[nextLocale].htmlLang;
    }
  }

  function detectDeviceLocale(): Locale {
    const deviceLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const hasPortuguese = deviceLanguages.some((language) =>
      language.toLowerCase().startsWith('pt')
    );

    return hasPortuguese ? 'pt' : 'en';
  }

  function isLocale(value: string | null): value is Locale {
    return value === 'en' || value === 'pt';
  }

  function createStructuredData(
    currentText: Translation,
    currentPageUrl: string,
    currentOgImageUrl: string
  ) {
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: siteName,
      alternateName: '8disc video compressor',
      url: currentPageUrl,
      image: currentOgImageUrl,
      screenshot: currentOgImageUrl,
      description: currentText.metaDescription,
      inLanguage: currentText.htmlLang,
      applicationCategory: 'MultimediaApplication',
      applicationSubCategory: 'Video compressor',
      operatingSystem: 'Web, Windows, Linux',
      browserRequirements: 'Requires JavaScript and WebAssembly for browser compression.',
      isAccessibleForFree: true,
      featureList: currentText.structuredFeatures,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD'
      },
      creator: {
        '@type': 'Person',
        name: 'Markzuel',
        url: 'https://github.com/lexmarcos'
      },
      sameAs: sameAsLinks,
      potentialAction: {
        '@type': 'UseAction',
        name: currentText.compress,
        target: currentPageUrl
      }
    }).replace(/</g, '\\u003c');
  }

  function isStatusKey(value: string): value is StatusKey {
    return value in translations.en.status;
  }

  function isTauriRuntime() {
    return browser && '__TAURI_INTERNALS__' in window;
  }

  async function controlWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
    if (!isDesktop) return;

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();

    if (action === 'minimize') {
      await appWindow.minimize();
    } else if (action === 'toggleMaximize') {
      await appWindow.toggleMaximize();
    } else {
      await appWindow.close();
    }
  }

  async function resizeWindow(direction: ResizeDirection) {
    if (!isDesktop) return;

    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startResizeDragging(direction);
  }

  async function handleFileInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await selectFile(input.files?.[0] ?? null);
  }

  function handleUploadClick(event: MouseEvent) {
    event.preventDefault();

    if (isDesktop) {
      void selectDesktopFile();
    } else {
      fileInput?.click();
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    isDragging = true;
  }

  function handleDragLeave() {
    isDragging = false;
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    await selectFile(event.dataTransfer?.files?.[0] ?? null);
  }

  async function selectFile(file: File | null) {
    errorKey = '';
    errorDetail = '';
    clearCompressedOutput();
    desktopVideo = null;

    if (!file) {
      videoFile = null;
      videoInfo = null;
      statusKey = 'chooseVideo';
      return;
    }

    if (file.type && !file.type.startsWith('video/')) {
      errorKey = 'invalidFile';
      return;
    }

    videoFile = file;

    if (file.size > getBrowserMaxInputBytes()) {
      errorKey = 'fileTooLarge';
      videoInfo = null;
      statusKey = 'compressionFailed';
      return;
    }

    statusKey = 'readingMetadata';

    try {
      videoInfo = await readVideoInfo(file);
      statusKey = 'ready';
    } catch {
      videoInfo = null;
      statusKey = 'ready';
    }
  }

  async function selectDesktopFile() {
    errorKey = '';
    errorDetail = '';
    clearCompressedOutput();
    desktopOutputPath = '';

    try {
      const [{ open }, { invoke }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/api/core')
      ]);
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Videos', extensions: videoExtensions }]
      });

      if (!selected || Array.isArray(selected)) {
        return;
      }

      videoFile = null;
      desktopVideo = null;
      videoInfo = null;
      statusKey = 'readingMetadata';

      const probe = await invoke<DesktopVideo>('probe_video', { path: selected });
      desktopVideo = probe;
      videoInfo = {
        duration: probe.duration,
        width: probe.width,
        height: probe.height
      };
      statusKey = 'ready';
    } catch (error) {
      setCompressionError(error);
      statusKey = 'compressionFailed';
    }
  }

  async function compressVideo() {
    if (compressionRequestLocked || !canCompress) return;

    compressionRequestLocked = true;

    if (isDesktop && desktopVideo) {
      try {
        await prepareNotificationSound();
        await compressDesktopVideo(desktopVideo);
      } finally {
        compressionRequestLocked = false;
      }
      return;
    }

    if (!videoFile) {
      compressionRequestLocked = false;
      return;
    }

    const jobFile = videoFile;
    const jobTarget = effectiveTargetMb;
    const jobTargetBytes = jobTarget * MB;
    let cleanupEncoder: FFmpegInstance | null = null;
    let inputName = '';
    const outputName = 'output.mp4';

    errorKey = '';
    errorDetail = '';
    clearCompressedOutput();
    ffmpegLogLines = [];
    isLoadingEngine = true;
    isCompressing = false;
    progress = 0;
    engineLoadProgress = 0;
    statusKey = 'preparingFfmpeg';

    try {
      await prepareNotificationSound();

      const webProfile = createWebEncodeProfile();
      const encoder = await loadEncoder();
      cleanupEncoder = encoder;
      const helper = fetchFile;

      if (!helper) {
        errorKey = 'readerFailed';
        throw new Error('file-reader-unavailable');
      }

      isLoadingEngine = false;
      stopEngineLoadProgress(100);
      isCompressing = true;
      statusKey = 'calculating';

      const info = videoInfo ?? (await readVideoInfo(jobFile));
      inputName = `input.${getExtension(jobFile.name)}`;
      const plan = createEncodePlan(info, jobTarget, webProfile);

      await safeDelete(encoder, inputName);
      await safeDelete(encoder, outputName);
      await encoder.writeFile(inputName, await helper(jobFile));

      statusKey = 'compressingLocal';
      const resultBlob = createVideoBlob(
        await runEncode(encoder, inputName, outputName, plan, webProfile)
      );

      compressedUrl = URL.createObjectURL(resultBlob);
      compressedSize = resultBlob.size;
      compressedName = getOutputFileName(jobFile.name, jobTarget);
      progress = 100;
      statusKey = resultBlob.size <= jobTargetBytes ? 'fileReady' : 'fileReadyOversized';
      playCompletionSound();
    } catch (error) {
      if (!errorKey) {
        errorKey = getCompressionErrorKey(error);
      }
      errorDetail = formatErrorDetail(error);
      statusKey = 'compressionFailed';
      progress = 0;
    } finally {
      if (cleanupEncoder) {
        if (inputName) {
          await safeDelete(cleanupEncoder, inputName);
        }
        await safeDelete(cleanupEncoder, outputName);
      }
      isLoadingEngine = false;
      stopEngineLoadProgress();
      isCompressing = false;
      compressionRequestLocked = false;
    }
  }

  async function compressDesktopVideo(video: DesktopVideo) {
    const jobTarget = effectiveTargetMb;
    const jobTargetBytes = jobTarget * MB;

    errorKey = '';
    errorDetail = '';
    clearCompressedOutput();
    desktopOutputPath = '';
    activeEncoder = '';
    progress = 0;
    statusKey = 'selectingOutput';
    let unlisten: (() => void) | null = null;

    try {
      const [{ invoke }, { listen }, { save }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
        import('@tauri-apps/plugin-dialog')
      ]);
      const outputPath = await save({
        defaultPath: getOutputFileName(video.name, jobTarget),
        filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
      });

      if (!outputPath) {
        statusKey = 'ready';
        return;
      }

      isCompressing = true;
      statusKey = 'detectingEncoder';

      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      unlisten = await listen<DesktopCompressionProgress>(
        'compression-progress',
        ({ payload }) => {
          if (payload.jobId !== jobId) return;

          progress = payload.percent;
          activeEncoder = payload.encoder;

          if (isStatusKey(payload.status)) {
            statusKey = payload.status;
          }
        }
      );

      const plan = createEncodePlan(video, jobTarget, isAdvancedMode ? createAdvancedEncodeProfile() : undefined);
      const result = await invoke<DesktopCompressionResult>('compress_video', {
        request: {
          jobId,
          inputPath: video.path,
          outputPath,
          plan
        }
      });

      desktopOutputPath = result.outputPath;
      compressedName = pathBaseName(result.outputPath);
      compressedSize = result.outputSize;
      progress = 100;
      activeEncoder = result.encoder;
      statusKey = result.outputSize <= jobTargetBytes ? 'fileReady' : 'fileReadyOversized';
      playCompletionSound();
    } catch (error) {
      setCompressionError(error);
      statusKey = 'compressionFailed';
      progress = 0;
    } finally {
      unlisten?.();
      isCompressing = false;
    }
  }

  async function loadEncoder() {
    const corePreference = isAdvancedMode ? advancedFfmpegCore : 'auto';

    if (ffmpeg && fetchFile && loadedFfmpegCore && isLoadedCoreAllowed(loadedFfmpegCore, corePreference)) {
      engineLoadProgress = 100;
      return ffmpeg;
    }

    if (ffmpeg) {
      ffmpeg.terminate();
      ffmpeg = null;
      fetchFile = null;
      loadedFfmpegCore = null;
    }

    setEngineLoadProgress(8);
    const [{ FFmpeg }, util] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util')
    ]);
    setEngineLoadProgress(18);
    const coreConfigs = await resolveFfmpegCoreConfigs(corePreference);
    setEngineLoadProgress(32);

    let lastError: unknown;

    for (const { label, config } of coreConfigs) {
      const instance = createFfmpegInstance(FFmpeg);
      activeEncoder = label;
      statusKey = 'loadingFfmpeg';
      setEngineLoadProgress(Math.max(engineLoadProgress, 42));
      startEngineLoadProgress();

      try {
        await loadFfmpegInstance(instance, config);
        stopEngineLoadProgress(100);
        ffmpeg = instance;
        fetchFile = util.fetchFile as FetchFile;
        loadedFfmpegCore = label === 'wasm mt' ? 'multi' : 'single';
        return instance;
      } catch (error) {
        lastError = error;
        stopEngineLoadProgress(Math.max(engineLoadProgress, 55));
        instance.terminate();
      }
    }

    throw lastError ?? new Error('ffmpeg-load-failed');
  }

  function isLoadedCoreAllowed(core: LoadedFfmpegCore, preference: FfmpegCorePreference) {
    if (preference === 'single') return core === 'single';
    if (preference === 'multi') return core === 'multi' || !supportsMultithreadEncoder();
    return true;
  }

  async function resolveFfmpegCoreConfigs(preference: FfmpegCorePreference) {
    const canUseMultithread = supportsMultithreadEncoder();

    if (preference === 'single') {
      return [{ label: 'wasm', config: await loadSingleThreadCore() }];
    }

    if (preference === 'multi' && canUseMultithread) {
      return [{ label: 'wasm mt', config: await loadMultithreadCore() }];
    }

    if (canUseMultithread) {
      return [
        { label: 'wasm mt', config: await loadMultithreadCore() },
        { label: 'wasm', config: await loadSingleThreadCore() }
      ];
    }

    return [{ label: 'wasm', config: await loadSingleThreadCore() }];
  }

  function createFfmpegInstance(FFmpeg: FFmpegConstructor) {
    const instance = new FFmpeg();

    instance.on('log', ({ message }) => {
      appendFfmpegLog(message);
    });

    instance.on('progress', ({ progress: ratio }) => {
      if (isCompressing) {
        progress = Math.max(1, Math.min(99, Math.round(ratio * 100)));
      }
    });

    return instance;
  }

  async function loadFfmpegInstance(instance: FFmpegInstance, coreConfig: FfmpegLoadConfig) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), FFMPEG_LOAD_TIMEOUT_MS);

    try {
      await instance.load(coreConfig, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('ffmpeg-load-timeout');
      }

      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function supportsMultithreadEncoder() {
    return (
      browser &&
      typeof SharedArrayBuffer !== 'undefined' &&
      !isMobileLikeDevice() &&
      globalThis.crossOriginIsolated === true
    );
  }

  function createWebEncodeProfile(): WebEncodeProfile {
    const isIOS = isIOSLikeDevice();
    const isMobile = isMobileLikeDevice();
    const advancedProfile = isAdvancedMode ? createAdvancedEncodeProfile() : null;

    return {
      isIOS,
      isMobile,
      maxLongEdge: advancedProfile?.maxLongEdge ?? (isMobile ? 854 : 1920),
      maxVideoKbps: advancedProfile?.maxVideoKbps ?? (isMobile ? MOBILE_MAX_VIDEO_KBPS : 12000),
      videoKbps: advancedProfile?.videoKbps ?? null,
      audioKbps: advancedProfile?.audioKbps,
      preset: advancedProfile?.preset ?? (isMobile ? 'ultrafast' : 'veryfast'),
      threads: advancedProfile?.threads ?? (isMobile ? 1 : null),
      useFastStart: advancedProfile?.useFastStart ?? !isMobile,
      videoProfile: advancedProfile?.videoProfile ?? (isMobile ? 'baseline' : null),
      h264Level: advancedProfile?.h264Level ?? (isMobile ? '3.1' : null),
      stripMetadata: advancedProfile?.stripMetadata ?? true,
      audioChannels: advancedProfile?.audioChannels ?? 2,
      audioSampleRate: advancedProfile?.audioSampleRate ?? 44100,
      pixelFormat: advancedProfile?.pixelFormat ?? 'yuv420p'
    };
  }

  function createAdvancedEncodeProfile(): EncodeProfile {
    const videoKbps = normalizePositiveInteger(advancedVideoKbps);
    const maxLongEdge = normalizePositiveInteger(advancedMaxLongEdge);
    const threads = normalizePositiveInteger(advancedThreads);

    return {
      maxLongEdge: maxLongEdge || undefined,
      maxVideoKbps: videoKbps || undefined,
      videoKbps: videoKbps || null,
      audioKbps: Math.max(16, normalizePositiveInteger(advancedAudioKbps) || 64),
      preset: advancedPreset,
      threads: threads || null,
      useFastStart: advancedFastStart,
      videoProfile: advancedH264Profile === 'auto' ? null : advancedH264Profile,
      h264Level: advancedH264Profile === 'baseline' ? '3.1' : null,
      stripMetadata: advancedStripMetadata,
      audioChannels: 2,
      audioSampleRate: 44100,
      pixelFormat: 'yuv420p'
    };
  }

  function isIOSLikeDevice() {
    if (!browser) return false;

    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );
  }

  function isMobileLikeDevice() {
    if (!browser) return false;

    return (
      isIOSLikeDevice() ||
      /Android|Mobile|Tablet/.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth < 900)
    );
  }

  function setEngineLoadProgress(value: number) {
    engineLoadProgress = Math.max(0, Math.min(100, Math.round(value)));
  }

  function startEngineLoadProgress() {
    stopEngineLoadProgress();

    engineLoadTimer = window.setInterval(() => {
      if (!isLoadingEngine || engineLoadProgress >= 92) return;

      const remaining = 92 - engineLoadProgress;
      setEngineLoadProgress(engineLoadProgress + Math.max(1, Math.ceil(remaining * 0.08)));
    }, 350);
  }

  function stopEngineLoadProgress(finalValue?: number) {
    if (engineLoadTimer !== null) {
      window.clearInterval(engineLoadTimer);
      engineLoadTimer = null;
    }

    if (typeof finalValue === 'number') {
      setEngineLoadProgress(finalValue);
    }
  }

  function appendFfmpegLog(message: string) {
    const trimmedMessage = message.replace(/\s+/g, ' ').trim();

    if (!trimmedMessage) return;

    ffmpegLogLines = [...ffmpegLogLines.slice(-7), trimmedMessage];
  }

  function getRecentFfmpegLog() {
    return ffmpegLogLines.slice(-4).join(' / ');
  }

  function getBrowserMaxInputBytes() {
    return isIOSLikeDevice() ? IOS_MAX_INPUT_BYTES : MAX_INPUT_BYTES;
  }

  async function loadSingleThreadCore(): Promise<FfmpegLoadConfig> {
    const [core, wasm] = await Promise.all([
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url')
    ]);

    return {
      coreURL: core.default,
      wasmURL: wasm.default
    };
  }

  async function loadMultithreadCore(): Promise<FfmpegLoadConfig> {
    const [core, wasm, worker] = await Promise.all([
      import('@ffmpeg/core-mt?url'),
      import('@ffmpeg/core-mt/wasm?url'),
      import('@ffmpeg/core-mt/worker?url')
    ]);

    return {
      coreURL: core.default,
      wasmURL: wasm.default,
      workerURL: worker.default
    };
  }

  async function runEncode(
    encoder: FFmpegInstance,
    inputName: string,
    outputName: string,
    plan: EncodePlan,
    profile?: WebEncodeProfile
  ) {
    await safeDelete(encoder, outputName);
    const exitCode = await encoder.exec(buildArgs(inputName, outputName, plan, profile));

    if (typeof exitCode === 'number' && exitCode !== 0) {
      const recentLog = getRecentFfmpegLog();
      throw new Error(recentLog ? `ffmpeg-exit-${exitCode}: ${recentLog}` : `ffmpeg-exit-${exitCode}`);
    }

    const data = await encoder.readFile(outputName);

    if (!(data instanceof Uint8Array)) {
      throw new Error('invalid-ffmpeg-output');
    }

    validateMp4Output(data);
    return data;
  }

  function buildArgs(
    inputName: string,
    outputName: string,
    plan: EncodePlan,
    profile?: WebEncodeProfile
  ) {
    const stripMetadata = plan.stripMetadata ?? profile?.stripMetadata ?? true;
    const preset = plan.preset ?? profile?.preset ?? 'veryfast';
    const threads = plan.threads ?? profile?.threads ?? null;
    const videoProfile = plan.videoProfile ?? profile?.videoProfile ?? null;
    const h264Level = plan.h264Level ?? profile?.h264Level ?? null;
    const pixelFormat = plan.pixelFormat ?? profile?.pixelFormat ?? 'yuv420p';
    const audioChannels = plan.audioChannels ?? profile?.audioChannels ?? 2;
    const audioSampleRate = plan.audioSampleRate ?? profile?.audioSampleRate ?? 44100;
    const useFastStart = plan.useFastStart ?? profile?.useFastStart ?? true;

    return [
      '-y',
      '-i',
      inputName,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-sn',
      '-dn',
      ...(stripMetadata ? ['-map_metadata', '-1', '-map_chapters', '-1'] : []),
      '-c:v',
      'libx264',
      '-preset',
      preset,
      ...(threads ? ['-threads', String(threads)] : []),
      ...(videoProfile ? ['-profile:v', videoProfile] : []),
      ...(h264Level ? ['-level', h264Level] : []),
      '-b:v',
      `${plan.videoKbps}k`,
      '-maxrate',
      `${plan.videoKbps}k`,
      '-bufsize',
      `${plan.videoKbps * 2}k`,
      ...(plan.width && plan.height ? ['-vf', `scale=${plan.width}:${plan.height}`] : []),
      '-pix_fmt',
      pixelFormat,
      '-c:a',
      'aac',
      '-b:a',
      `${plan.audioKbps}k`,
      '-ac',
      String(audioChannels),
      '-ar',
      String(audioSampleRate),
      '-max_muxing_queue_size',
      '1024',
      ...(useFastStart ? ['-movflags', '+faststart'] : []),
      '-f',
      'mp4',
      outputName
    ];
  }

  function createEncodePlan(
    info: VideoInfo,
    target: number,
    profile?: EncodeProfile
  ): EncodePlan {
    const duration = Number.isFinite(info.duration) && info.duration > 0 ? info.duration : 1;
    const totalKbps = Math.floor(
      ((target * MB * 8) / duration / 1000) * TARGET_BITRATE_UTILIZATION
    );
    const preferredAudio = target <= 8 ? 48 : target <= 16 ? 64 : 96;
    const audioKbps =
      profile?.audioKbps ?? Math.max(32, Math.min(preferredAudio, Math.floor(totalKbps * 0.22)));
    const videoKbps = Math.max(
      MIN_VIDEO_KBPS,
      profile?.videoKbps ??
        Math.min(profile?.maxVideoKbps ?? Number.POSITIVE_INFINITY, totalKbps - audioKbps)
    );
    const scale = chooseScale(info, videoKbps, profile?.maxLongEdge);

    return {
      audioKbps,
      videoKbps,
      width: scale?.width ?? null,
      height: scale?.height ?? null,
      preset: profile?.preset ?? null,
      threads: profile?.threads ?? null,
      useFastStart: profile?.useFastStart,
      videoProfile: profile?.videoProfile ?? null,
      h264Level: profile?.h264Level ?? null,
      stripMetadata: profile?.stripMetadata,
      audioChannels: profile?.audioChannels,
      audioSampleRate: profile?.audioSampleRate,
      pixelFormat: profile?.pixelFormat
    };
  }

  function chooseScale(info: VideoInfo, videoKbps: number, maxLongEdge?: number) {
    if (!info.width || !info.height) return null;

    const longEdge = Math.max(info.width, info.height);
    const shortEdge = Math.min(info.width, info.height);
    const currentTier = RESOLUTION_TIERS.find((tier) => longEdge >= tier.longEdge);
    const selectedTier =
      RESOLUTION_TIERS.find(
        (tier) => longEdge >= tier.longEdge && videoKbps >= tier.minVideoKbps
      ) ?? RESOLUTION_TIERS[RESOLUTION_TIERS.length - 1];
    const selectedLongEdge = maxLongEdge
      ? Math.min(selectedTier.longEdge, maxLongEdge)
      : selectedTier.longEdge;

    if (!currentTier || selectedLongEdge >= longEdge) {
      return null;
    }

    const ratio = selectedLongEdge / longEdge;
    const scaledLongEdge = makeEven(selectedLongEdge);
    const scaledShortEdge = makeEven(shortEdge * ratio);

    return info.width >= info.height
      ? { width: scaledLongEdge, height: scaledShortEdge }
      : { width: scaledShortEdge, height: scaledLongEdge };
  }

  function readVideoInfo(file: File) {
    return new Promise<VideoInfo>((resolve, reject) => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          duration: video.duration,
          width: video.videoWidth,
          height: video.videoHeight
        });
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('metadata-unavailable'));
      };
      video.src = objectUrl;
    });
  }

  async function prepareNotificationSound() {
    if (!browser) return;

    const audioWindow = window as Window & {
      AudioContext?: AudioContextConstructor;
      webkitAudioContext?: AudioContextConstructor;
    };
    const AudioContextClass = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = notificationAudioContext ?? new AudioContextClass();
    notificationAudioContext = context;

    if (context.state === 'suspended') {
      await context.resume();
    }
  }

  function playCompletionSound() {
    if (!browser) return;

    void prepareNotificationSound().then(() => {
      const context = notificationAudioContext;
      if (!context || context.state === 'closed') return;

      const start = context.currentTime + 0.02;
      const master = context.createGain();
      master.gain.setValueAtTime(0.0001, start);
      master.gain.exponentialRampToValueAtTime(0.08, start + 0.05);
      master.gain.exponentialRampToValueAtTime(0.0001, start + 1.45);
      master.connect(context.destination);

      playTone(context, master, 523.25, start, 0.95, 0.42);
      playTone(context, master, 659.25, start + 0.08, 1.05, 0.32);
      playTone(context, master, 783.99, start + 0.18, 1.15, 0.26);

      window.setTimeout(() => master.disconnect(), 1600);
    });
  }

  function playTone(
    context: AudioContext,
    output: AudioNode,
    frequency: number,
    start: number,
    duration: number,
    volume: number
  ) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const end = start + duration;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }

  async function safeDelete(encoder: FFmpegInstance, path: string) {
    try {
      await encoder.deleteFile(path);
    } catch {
      // Missing virtual files are expected between runs.
    }
  }

  function clearCompressedOutput() {
    if (compressedUrl) {
      URL.revokeObjectURL(compressedUrl);
    }

    compressedUrl = '';
    desktopOutputPath = '';
    compressedSize = 0;
    activeEncoder = '';
  }

  function setCompressionError(error: unknown, key: ErrorKey = 'compressFailed') {
    errorKey = key;
    errorDetail = formatErrorDetail(error);
  }

  function getCompressionErrorKey(error: unknown): ErrorKey {
    if (error instanceof Error && error.message.startsWith('invalid-mp4-output')) {
      return 'invalidOutput';
    }

    return 'compressFailed';
  }

  function formatErrorDetail(error: unknown) {
    let detail = '';

    if (typeof error === 'string') {
      detail = error;
    } else if (error instanceof Error) {
      detail = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      detail = typeof message === 'string' ? message : '';
    } else if (error !== undefined && error !== null) {
      try {
        detail = JSON.stringify(error);
      } catch {
        detail = String(error);
      }
    }

    return detail.replace(/\s+/g, ' ').trim().slice(0, 240);
  }

  function createVideoBlob(data: Uint8Array) {
    const arrayBuffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(arrayBuffer).set(data);
    return new Blob([arrayBuffer], { type: 'video/mp4' });
  }

  function validateMp4Output(data: Uint8Array) {
    if (data.byteLength < MIN_VALID_MP4_BYTES) {
      throw new Error(`invalid-mp4-output:${data.byteLength}`);
    }

    const fileType = String.fromCharCode(...data.slice(4, 8));

    if (fileType !== 'ftyp') {
      throw new Error('invalid-mp4-output:missing-ftyp');
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes) return '0 MB';
    const size = bytes / MB;
    return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} MB`;
  }

  function getExtension(name: string) {
    return name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
  }

  function withoutExtension(name: string) {
    return name.replace(/\.[^/.]+$/, '') || 'video';
  }

  function getOutputFileName(inputName: string, targetMb: number) {
    const fallbackName = `${withoutExtension(inputName)}-${formatTargetValue(targetMb)}mb`;
    const rawName = isAdvancedMode ? advancedOutputName.trim() : '';
    const baseName = sanitizeFileName(rawName || fallbackName) || fallbackName;
    return baseName.toLowerCase().endsWith('.mp4') ? baseName : `${baseName}.mp4`;
  }

  function sanitizeFileName(name: string) {
    return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  }

  function normalizeTargetMb(value: number) {
    return Math.max(1, Math.min(2_000, Number.isFinite(value) ? value : 8));
  }

  function normalizePositiveInteger(value: number) {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  function formatTargetValue(value: number) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function pathBaseName(path: string) {
    return path.split(/[\\/]/).pop() || path;
  }

  function makeEven(value: number) {
    const rounded = Math.max(2, Math.floor(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }

</script>

<svelte:head>
  <title>{text.metaTitle}</title>
  <meta name="description" content={text.metaDescription} />
  <meta name="author" content="Markzuel" />
  <meta
    name="robots"
    content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  />
  <link rel="canonical" href={pageUrl} />
  {#each alternateLinks as alternate}
    <link rel="alternate" hreflang={alternate.hreflang} href={alternate.href} />
  {/each}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={siteName} />
  <meta property="og:title" content={text.ogTitle} />
  <meta property="og:description" content={text.ogDescription} />
  <meta property="og:url" content={pageUrl} />
  <meta property="og:image" content={ogImageUrl} />
  <meta property="og:image:secure_url" content={ogImageUrl} />
  <meta property="og:image:alt" content={text.ogTitle} />
  <meta property="og:image:type" content={ogImageType} />
  <meta property="og:image:width" content={String(ogImageWidth)} />
  <meta property="og:image:height" content={String(ogImageHeight)} />
  <meta property="og:locale" content={text.htmlLang.replace('-', '_')} />
  {#each localizedPages.filter((page) => page.locale !== locale) as alternateLocale}
    <meta property="og:locale:alternate" content={alternateLocale.hreflang.replace('-', '_')} />
  {/each}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={text.ogTitle} />
  <meta name="twitter:description" content={text.ogDescription} />
  <meta name="twitter:image" content={ogImageUrl} />
  {@html `<script type="application/ld+json">${structuredData}</script>`}
</svelte:head>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<main
  class={[
    'relative min-h-screen overflow-hidden bg-[#1713c8] px-4 pb-4 text-[#fbfbff] sm:px-6',
    isDesktop ? 'pt-[3.75rem]' : 'pt-4'
  ]}
>
  <div
    class="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]"
  ></div>
  <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#fbfbff]/40"></div>

  {#if isDesktop}
    {#each resizeHandles as handle}
      <button
        type="button"
        class={[handle.className, 'border-0 bg-transparent p-0']}
        aria-label={`Resize ${handle.direction}`}
        tabindex="-1"
        onpointerdown={(event) => {
          if (event.button !== 0) return;

          event.preventDefault();
          void resizeWindow(handle.direction);
        }}
      ></button>
    {/each}

    <div
      class="absolute inset-x-0 top-0 z-30 flex h-11 select-none items-center justify-between border-b border-[#fbfbff]/20 bg-[#1713c8] text-[#fbfbff]"
      data-tauri-drag-region
    >
      <div class="flex min-w-0 items-center gap-3 px-3" data-tauri-drag-region>
        <img class="size-6 shrink-0 object-contain" src="/Logo.svg" alt="" data-tauri-drag-region />
        <span class="truncate text-sm font-bold tracking-normal" data-tauri-drag-region>8disc</span>
      </div>
      <div class="flex h-full items-stretch">
        <button
          type="button"
          class="grid w-12 place-items-center text-lg leading-none text-[#fbfbff] transition hover:bg-[#fbfbff]/15 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#fbfbff]"
          aria-label="Minimize"
          onclick={() => void controlWindow('minimize')}
        >
          -
        </button>
        <button
          type="button"
          class="grid w-12 place-items-center text-sm leading-none text-[#fbfbff] transition hover:bg-[#fbfbff]/15 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#fbfbff]"
          aria-label="Maximize"
          onclick={() => void controlWindow('toggleMaximize')}
        >
          □
        </button>
        <button
          type="button"
          class="grid w-12 place-items-center text-lg leading-none text-[#fbfbff] transition hover:bg-[#e81123] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#fbfbff]"
          aria-label="Close"
          onclick={() => void controlWindow('close')}
        >
          ×
        </button>
      </div>
    </div>
  {/if}

  <div
    class={[
      'relative mx-auto flex w-full max-w-4xl flex-col',
      isDesktop ? 'min-h-[calc(100vh-4.75rem)]' : 'min-h-[calc(100vh-2rem)]'
    ]}
  >
    <header class="flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.18em] text-[#d8d7ff]">
      <a class="block size-14 shrink-0 sm:size-16" href="/" aria-label="8disc">
        <img class="size-full object-contain" src="/Logo.svg" alt="8disc" />
      </a>
      <span class="hidden sm:inline">{isDesktop ? text.desktopHeaderMeta : text.headerMeta}</span>
      <div class="flex items-center gap-2">
        {#if !isDesktop}
          <div class="relative" bind:this={downloadMenuElement}>
            <button
              type="button"
              class="flex min-h-8 items-center gap-2 border border-[#fbfbff]/35 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
              aria-haspopup="menu"
              aria-expanded={downloadMenuOpen}
              aria-label={text.downloadMenuLabel}
              onclick={toggleDownloadMenu}
            >
              {text.downloadApp}
              <svg
                class={[
                  'size-3 transition-transform',
                  downloadMenuOpen ? 'rotate-180' : 'rotate-0'
                ]}
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
              </svg>
            </button>

            {#if downloadMenuOpen}
              <div
                class="absolute left-0 right-0 top-full z-50 mt-2 border border-[#fbfbff] bg-[#fbfbff]"
                role="menu"
                aria-label={text.downloadMenuLabel}
              >
                {#each desktopDownloadOptions as option}
                  <a
                    class="flex min-h-10 items-center gap-3 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#1713c8] transition hover:bg-[#1713c8]/10 focus:bg-[#1713c8]/10 focus:outline-none"
                    href={option.href}
                    target="_blank"
                    rel="noreferrer"
                    role="menuitem"
                    onclick={closeDownloadMenu}
                  >
                    {#if option.platform === 'windows'}
                      <svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M3 4.6 10.7 3.5v8H3V4.6Zm9-1.3L21 2v9.5h-9V3.3ZM3 12.8h7.7v7.7L3 19.4v-6.6Zm9 0h9V22l-9-1.3v-7.9Z" />
                      </svg>
                      <span>{text.downloadWindows}</span>
                    {:else}
                      <img class="size-4 shrink-0 object-contain" src="/linux-logo.svg" alt="" />
                      <span>{text.downloadLinux}</span>
                    {/if}
                  </a>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <div class="flex items-center border border-[#fbfbff]/35" role="group" aria-label={text.languageLabel}>
          {#each languageOptions as option}
            <a
              class={[
                'grid min-h-8 place-items-center px-3 text-[10px] font-black uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-[#fbfbff]',
                locale === option.code
                  ? 'bg-[#fbfbff] text-[#1713c8]'
                  : 'bg-transparent text-[#d8d7ff] hover:bg-[#fbfbff]/15 hover:text-[#fbfbff]'
              ]}
              href={option.href}
              hreflang={option.hreflang}
              aria-current={locale === option.code ? 'page' : undefined}
              onclick={() => setLocale(option.code)}
            >
              {option.label}
            </a>
          {/each}
        </div>
      </div>
    </header>

    <section class="flex flex-1 flex-col items-center justify-center gap-7 py-10 sm:py-12">
      <div class="max-w-2xl text-center">
        <p class="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-[#bdbcff]">
          {text.eyebrow}
        </p>
        <h1 class="text-4xl font-black tracking-normal text-[#fbfbff] sm:text-6xl">
          {text.headline}
        </h1>
      </div>

      <div class="w-full max-w-2xl">
        <input
          bind:this={fileInput}
          class="sr-only"
          type="file"
          accept="video/*"
          disabled={isDesktop}
          onchange={handleFileInput}
        />

        <button
          type="button"
          class={[
            'group flex min-h-48 w-full cursor-pointer flex-col items-center justify-center border border-dashed bg-[#1110aa]/50 p-6 text-center transition',
            isDragging
              ? 'border-[#fbfbff] bg-[#fbfbff] text-[#1713c8]'
              : 'border-[#fbfbff]/45 hover:border-[#fbfbff] hover:bg-[#1c18d7]'
          ]}
          aria-label={text.uploadAria}
          onclick={handleUploadClick}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
        >
          <span
            class={[
              'mb-5 grid size-12 place-items-center border text-xl font-black transition',
              isDragging
                ? 'border-[#1713c8] bg-[#1713c8] text-[#fbfbff]'
                : 'border-[#fbfbff]/60 bg-[#fbfbff] text-[#1713c8] group-hover:translate-y-[-2px]'
            ]}
          >
            ↑
          </span>

          {#if hasSelectedVideo}
            <span class="max-w-full truncate text-lg font-black">{selectedVideoName}</span>
            <span class="mt-2 text-sm text-[#d8d7ff]">{inputSize}</span>
          {:else}
            <span class="text-lg font-black">{text.uploadTitle}</span>
            <span class="mt-2 text-sm text-[#d8d7ff]">{text.uploadSubtitle}</span>
          {/if}
        </button>
      </div>

      {#if isAdvancedMode}
        <section
          class="grid w-full max-w-2xl gap-3 border border-[#fbfbff]/35 bg-[#1410bd]/50 p-4"
          aria-label={text.advanced.settings}
        >
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-xs font-black uppercase tracking-[0.18em] text-[#d8d7ff]">
              {text.advanced.settings}
            </h2>
            <a
              class="grid min-h-9 place-items-center border border-[#fbfbff]/35 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
              href={modeHref}
            >
              {text.simpleMode}
            </a>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.target}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-base font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                type="number"
                min="1"
                max="2000"
                step="0.1"
                bind:value={advancedTargetMb}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.outputName}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none placeholder:text-[#d8d7ff]/55 focus:border-[#fbfbff] disabled:opacity-60"
                type="text"
                placeholder={text.advanced.outputPlaceholder}
                bind:value={advancedOutputName}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.webEngine}
              <select
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                bind:value={advancedFfmpegCore}
                disabled={isLoadingEngine || isCompressing || isDesktop}
              >
                <option value="auto">{text.advanced.engineAuto}</option>
                <option value="single">{text.advanced.engineSingle}</option>
                <option value="multi">{text.advanced.engineMulti}</option>
              </select>
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.preset}
              <select
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                bind:value={advancedPreset}
                disabled={isLoadingEngine || isCompressing}
              >
                {#each presetOptions as preset}
                  <option value={preset}>{preset}</option>
                {/each}
              </select>
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.profile}
              <select
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                bind:value={advancedH264Profile}
                disabled={isLoadingEngine || isCompressing}
              >
                {#each profileOptions as profile}
                  <option value={profile}>{profile === 'auto' ? text.advanced.auto : profile}</option>
                {/each}
              </select>
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-4">
            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.videoKbps}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                type="number"
                min="0"
                step="100"
                bind:value={advancedVideoKbps}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.audioKbps}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                type="number"
                min="16"
                step="16"
                bind:value={advancedAudioKbps}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.maxEdge}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                type="number"
                min="0"
                step="2"
                bind:value={advancedMaxLongEdge}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>

            <label class="grid gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
              {text.advanced.threads}
              <input
                class="min-h-11 border border-[#fbfbff]/35 bg-[#0f0ca4] px-3 text-sm font-bold text-[#fbfbff] outline-none focus:border-[#fbfbff] disabled:opacity-60"
                type="number"
                min="0"
                step="1"
                bind:value={advancedThreads}
                disabled={isLoadingEngine || isCompressing}
              />
            </label>
          </div>

          <div class="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#d8d7ff]">
            <label class="flex min-h-10 items-center gap-2 border border-[#fbfbff]/25 px-3">
              <input type="checkbox" bind:checked={advancedFastStart} disabled={isLoadingEngine || isCompressing} />
              {text.advanced.fastStart}
            </label>
            <label class="flex min-h-10 items-center gap-2 border border-[#fbfbff]/25 px-3">
              <input type="checkbox" bind:checked={advancedStripMetadata} disabled={isLoadingEngine || isCompressing} />
              {text.advanced.stripMetadata}
            </label>
          </div>
        </section>
      {:else}
        <div class="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-5" aria-label={text.targetAria}>
          {#each targetSizes as size}
            <button
              type="button"
              class={[
                'min-h-20 border px-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#fbfbff] disabled:cursor-not-allowed disabled:opacity-60',
                selectedTarget === size
                  ? 'border-[#fbfbff] bg-[#fbfbff] text-[#1713c8] shadow-[6px_6px_0_rgba(255,255,255,.18)]'
                  : 'border-[#fbfbff]/35 bg-[#1410bd]/70 text-[#fbfbff] hover:border-[#fbfbff] hover:bg-[#1c18d7]'
              ]}
              aria-pressed={selectedTarget === size}
              disabled={isLoadingEngine || isCompressing}
              onclick={() => {
                if (!isLoadingEngine && !isCompressing) {
                  selectedTarget = size;
                }
              }}
            >
              <span class="block text-2xl font-black">{size}</span>
              <span class="text-xs uppercase tracking-[0.18em] opacity-75">{text.megabytes}</span>
            </button>
          {/each}
          <a
            class="flex min-h-20 flex-col justify-center border border-[#fbfbff]/35 bg-[#1410bd]/70 px-3 text-left text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
            href={modeHref}
          >
            <span class="block text-lg font-black uppercase tracking-normal">{text.advancedMode}</span>
            <span class="text-xs uppercase tracking-[0.18em] opacity-75">FFmpeg</span>
          </a>
        </div>
      {/if}

      {#if isVideoAtOrBelowTarget}
        <div
          class="w-full max-w-2xl border border-[#fbfbff]/45 bg-[#fbfbff] px-4 py-3 text-sm font-bold text-[#1713c8]"
          aria-live="polite"
        >
          {text.alreadyBelowTarget(effectiveTargetMb)}
        </div>
      {/if}

      <div class="flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
        <button
          type="button"
          class="min-h-14 flex-1 border border-[#fbfbff] bg-[#fbfbff] px-5 text-sm font-black uppercase tracking-[0.2em] text-[#1713c8] transition hover:translate-y-[-1px] hover:shadow-[8px_8px_0_rgba(255,255,255,.16)] disabled:translate-y-0 disabled:border-[#fbfbff]/35 disabled:bg-[#fbfbff]/25 disabled:text-[#fbfbff]/55 disabled:shadow-none"
          disabled={!canCompress}
          onclick={compressVideo}
        >
          {isLoadingEngine || isCompressing ? text.compressing : text.compress}
        </button>

        {#if compressedUrl}
          <a
            class="grid min-h-14 place-items-center border border-[#fbfbff]/55 bg-[#1410bd] px-5 text-sm font-black uppercase tracking-[0.16em] text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#1c18d7]"
            href={compressedUrl}
            download={compressedName}
          >
            {text.download} · {outputSize}
          </a>
        {:else if desktopOutputPath}
          <div class="grid min-h-14 place-items-center border border-[#fbfbff]/55 bg-[#1410bd] px-5 text-center text-sm font-black uppercase tracking-[0.16em] text-[#fbfbff]">
            {pathBaseName(desktopOutputPath)} · {outputSize}
          </div>
        {/if}
      </div>

      <div class="w-full max-w-2xl" aria-live="polite">
        <div class="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[#d8d7ff]">
          <span>{engineDetail}</span>
          <span>{progressRightLabel}</span>
        </div>
        <div class="mt-3 h-1.5 w-full overflow-hidden bg-[#fbfbff]/20">
          <div
            class="h-full bg-[#fbfbff] transition-[width]"
            style={`width: ${progressBarValue}%`}
          ></div>
        </div>
        {#if errorText}
          <div class="mt-3 border border-[#fbfbff]/40 bg-[#fbfbff] px-4 py-3 text-sm font-bold text-[#1713c8]">
            <p>{errorText}</p>
            {#if errorDetail}
              <p class="mt-2 text-xs font-semibold normal-case tracking-normal opacity-75">{errorDetail}</p>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <footer class="flex flex-col items-center justify-between gap-4 border-t border-[#fbfbff]/25 py-5 text-[#d8d7ff] sm:flex-row">
      <p class="text-xs font-bold uppercase tracking-[0.18em]">{text.createdBy}</p>

      <nav class="flex items-center gap-2" aria-label={text.createdBy}>
        <a
          class="grid size-10 place-items-center border border-[#fbfbff]/35 text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
          href="https://github.com/lexmarcos"
          target="_blank"
          rel="noreferrer"
          aria-label={text.social.github}
        >
          <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.29 9.41 7.86 10.94.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.98 10.98 0 0 1 5.76 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.16c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
        </a>

        <a
          class="grid size-10 place-items-center border border-[#fbfbff]/35 text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
          href="https://www.instagram.com/markzuel/"
          target="_blank"
          rel="noreferrer"
          aria-label={text.social.instagram}
        >
          <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="18" height="18" x="3" y="3" rx="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </a>

        <a
          class="grid size-10 place-items-center border border-[#fbfbff]/35 text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
          href="https://x.com/mark_zuel"
          target="_blank"
          rel="noreferrer"
          aria-label={text.social.x}
        >
          <svg class="size-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M18.25 2.5h3.38l-7.38 8.43 8.68 11.47h-6.8l-5.32-6.96-6.09 6.96H1.34l7.89-9.02L.91 2.5h6.97l4.81 6.36 5.56-6.36Zm-1.19 17.88h1.87L6.86 4.41h-2L17.06 20.38Z" />
          </svg>
        </a>

        <a
          class="grid size-10 place-items-center border border-[#fbfbff]/35 text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
          href="https://www.linkedin.com/in/marcosuelfilho/"
          target="_blank"
          rel="noreferrer"
          aria-label={text.social.linkedin}
        >
          <svg class="size-5" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5.01 2.5 2.5 0 0 1 0-5.01ZM3 9.74h3.96V21H3V9.74Zm6.17 0h3.79v1.54h.05c.53-.95 1.82-1.95 3.74-1.95 4 0 4.74 2.63 4.74 6.05V21h-3.95v-4.98c0-1.19-.02-2.71-1.65-2.71-1.66 0-1.91 1.29-1.91 2.62V21H9.17V9.74Z" />
          </svg>
        </a>
      </nav>
    </footer>
  </div>
</main>
