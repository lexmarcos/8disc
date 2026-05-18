<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import type { FFmpeg as FFmpegInstance } from '@ffmpeg/ffmpeg';

  type TargetSize = 8 | 16 | 25 | 50 | 100;
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

  const translations = {
    en: {
      htmlLang: 'en',
      metaTitle: '8disc - Local video compressor',
      metaDescription: 'Compress videos locally to 8 MB, 16 MB, 25 MB, 50 MB, or 100 MB.',
      headerMeta: 'local / wasm / mp4',
      desktopHeaderMeta: 'local / gpu / mp4',
      languageLabel: 'Language',
      downloadApp: 'Download app',
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
        adjustingTarget: 'Tuning for the target',
        fileReady: 'File ready',
        fileReadyOversized: 'File ready, above target',
        compressionFailed: 'Compression failed'
      },
      errors: {
        invalidFile: 'Upload a video file.',
        fileTooLarge: 'This video is too large for browser compression. Use a file up to 2 GB.',
        readerFailed: 'Could not load the file reader.',
        compressFailed: 'Could not compress this video.'
      },
      progress: (value: number) => `Compressing ${value}%`
    },
    pt: {
      htmlLang: 'pt-BR',
      metaTitle: '8disc - Compressor local de video',
      metaDescription:
        'Comprima videos localmente para 8 MB, 16 MB, 25 MB, 50 MB ou 100 MB.',
      headerMeta: 'local / wasm / mp4',
      desktopHeaderMeta: 'local / gpu / mp4',
      languageLabel: 'Idioma',
      downloadApp: 'Baixar app',
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
        adjustingTarget: 'Ajustando para a meta',
        fileReady: 'Arquivo pronto',
        fileReadyOversized: 'Arquivo pronto, acima da meta',
        compressionFailed: 'Falha na compressao'
      },
      errors: {
        invalidFile: 'Envie um arquivo de video.',
        fileTooLarge: 'Este video e grande demais para compressao no navegador. Use um arquivo de ate 2 GB.',
        readerFailed: 'Nao foi possivel carregar o leitor de arquivos.',
        compressFailed: 'Nao foi possivel comprimir o video.'
      },
      progress: (value: number) => `Comprimindo ${value}%`
    }
  } as const;

  type Locale = keyof typeof translations;
  type StatusKey = keyof (typeof translations)['en']['status'];
  type ErrorKey = keyof (typeof translations)['en']['errors'];

  const targetSizes = [8, 16, 25, 50, 100] as const;
  const languageOptions = [
    { code: 'en', label: 'EN' },
    { code: 'pt', label: 'PT' }
  ] as const;
  const MB = 1024 * 1024;
  const MAX_INPUT_BYTES = 2 * 1024 * MB;
  const TARGET_BITRATE_UTILIZATION = 0.97;
  const SIZE_RETRY_LOWER_BOUND = 0.94;
  const SIZE_RETRY_TIGHTENING = 0.96;
  const SIZE_RETRY_EXPANSION = 0.98;
  const MIN_VIDEO_KBPS = 80;
  const desktopDownloadUrl = 'https://github.com/lexmarcos/8disc/releases/latest';
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

  let locale: Locale = 'en';
  let selectedTarget: TargetSize = 8;
  let isDesktop = isTauriRuntime();
  let videoFile: File | null = null;
  let desktopVideo: DesktopVideo | null = null;
  let videoInfo: VideoInfo | null = null;
  let fileInput: HTMLInputElement;
  let ffmpeg: FFmpegInstance | null = null;
  let fetchFile: FetchFile | null = null;

  let isDragging = false;
  let isLoadingEngine = false;
  let isCompressing = false;
  let progress = 0;
  let statusKey: StatusKey = 'chooseVideo';
  let errorKey: ErrorKey | '' = '';
  let compressedUrl = '';
  let compressedName = 'compressed-video.mp4';
  let compressedSize = 0;
  let desktopOutputPath = '';
  let activeEncoder = '';
  let errorDetail = '';

  $: text = translations[locale];
  $: selectedVideoName = desktopVideo?.name ?? videoFile?.name ?? '';
  $: selectedVideoSize = desktopVideo?.size ?? videoFile?.size ?? 0;
  $: hasSelectedVideo = Boolean(desktopVideo || videoFile);
  $: canCompress = hasSelectedVideo && !errorKey && !isLoadingEngine && !isCompressing;
  $: targetBytes = selectedTarget * MB;
  $: inputSize = selectedVideoSize ? formatBytes(selectedVideoSize) : '';
  $: outputSize = compressedSize ? formatBytes(compressedSize) : '';
  $: engineLabel = isLoadingEngine
    ? text.status.preparingFfmpeg
    : isCompressing
      ? progress > 0
        ? text.progress(progress)
        : text.status[statusKey]
      : text.status[statusKey];
  $: engineDetail = activeEncoder ? `${engineLabel} / ${activeEncoder}` : engineLabel;
  $: errorText = errorKey ? text.errors[errorKey] : '';

  onMount(() => {
    isDesktop = isTauriRuntime();

    const savedLocale = localStorage.getItem('8disc:locale');

    if (isLocale(savedLocale)) {
      applyLocale(savedLocale);
    } else {
      applyLocale(detectDeviceLocale());
    }
  });

  onDestroy(() => {
    clearCompressedOutput();
  });

  function setLocale(nextLocale: Locale) {
    applyLocale(nextLocale);
    localStorage.setItem('8disc:locale', nextLocale);
  }

  function applyLocale(nextLocale: Locale) {
    locale = nextLocale;

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

    if (file.size > MAX_INPUT_BYTES) {
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
    if (isDesktop && desktopVideo) {
      await compressDesktopVideo(desktopVideo);
      return;
    }

    if (!videoFile) return;

    const jobTarget = selectedTarget;
    const jobTargetBytes = jobTarget * MB;
    let cleanupEncoder: FFmpegInstance | null = null;
    let inputName = '';
    const outputName = 'output.mp4';

    errorKey = '';
    errorDetail = '';
    clearCompressedOutput();
    isLoadingEngine = true;
    isCompressing = false;
    progress = 0;

    try {
      const encoder = await loadEncoder();
      cleanupEncoder = encoder;
      const helper = fetchFile;

      if (!helper) {
        errorKey = 'readerFailed';
        throw new Error('file-reader-unavailable');
      }

      isLoadingEngine = false;
      isCompressing = true;
      statusKey = 'calculating';

      const info = videoInfo ?? (await readVideoInfo(videoFile));
      inputName = `input.${getExtension(videoFile.name)}`;
      const basePlan = createEncodePlan(info, jobTarget);

      await safeDelete(encoder, inputName);
      await safeDelete(encoder, outputName);
      await encoder.writeFile(inputName, await helper(videoFile));

      statusKey = 'compressingLocal';
      let activePlan = basePlan;
      let resultBlob = createVideoBlob(await runEncode(encoder, inputName, outputName, activePlan));

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const adjustedPlan = createSizeAdjustedPlan(activePlan, jobTargetBytes, resultBlob.size);
        if (!adjustedPlan) {
          break;
        }

        activePlan = adjustedPlan;
        statusKey = 'adjustingTarget';
        resultBlob = createVideoBlob(await runEncode(encoder, inputName, outputName, activePlan));
      }

      compressedUrl = URL.createObjectURL(resultBlob);
      compressedSize = resultBlob.size;
      compressedName = `${withoutExtension(videoFile.name)}-${jobTarget}mb.mp4`;
      progress = 100;
      statusKey = resultBlob.size <= jobTargetBytes ? 'fileReady' : 'fileReadyOversized';
    } catch (error) {
      if (!errorKey) {
        errorKey = 'compressFailed';
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
      isCompressing = false;
    }
  }

  async function compressDesktopVideo(video: DesktopVideo) {
    const jobTarget = selectedTarget;
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
        defaultPath: `${withoutExtension(video.name)}-${jobTarget}mb.mp4`,
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

      const plan = createEncodePlan(video, jobTarget);
      const result = await invoke<DesktopCompressionResult>('compress_video', {
        request: {
          jobId,
          inputPath: video.path,
          outputPath,
          plan,
          targetBytes: jobTargetBytes
        }
      });

      desktopOutputPath = result.outputPath;
      compressedName = pathBaseName(result.outputPath);
      compressedSize = result.outputSize;
      progress = 100;
      activeEncoder = result.encoder;
      statusKey = result.outputSize <= jobTargetBytes ? 'fileReady' : 'fileReadyOversized';
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
    if (ffmpeg && fetchFile) {
      return ffmpeg;
    }

    statusKey = 'loadingFfmpeg';

    const [{ FFmpeg }, util] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util')
    ]);
    const coreConfig = supportsMultithreadEncoder()
      ? await loadMultithreadCore()
      : await loadSingleThreadCore();

    const instance = new FFmpeg();
    instance.on('progress', ({ progress: ratio }) => {
      if (isCompressing) {
        progress = Math.max(1, Math.min(99, Math.round(ratio * 100)));
      }
    });

    await instance.load(coreConfig);

    ffmpeg = instance;
    fetchFile = util.fetchFile as FetchFile;
    return instance;
  }

  function supportsMultithreadEncoder() {
    return (
      browser &&
      typeof SharedArrayBuffer !== 'undefined' &&
      globalThis.crossOriginIsolated === true
    );
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
    plan: EncodePlan
  ) {
    await safeDelete(encoder, outputName);
    await encoder.exec(buildArgs(inputName, outputName, plan));
    const data = await encoder.readFile(outputName);

    if (!(data instanceof Uint8Array)) {
      throw new Error('invalid-ffmpeg-output');
    }

    return data;
  }

  function buildArgs(inputName: string, outputName: string, plan: EncodePlan) {
    return [
      '-y',
      '-i',
      inputName,
      '-map',
      '0:v:0',
      '-map',
      '0:a?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-b:v',
      `${plan.videoKbps}k`,
      '-maxrate',
      `${plan.videoKbps}k`,
      '-bufsize',
      `${plan.videoKbps * 2}k`,
      ...(plan.width && plan.height ? ['-vf', `scale=${plan.width}:${plan.height}`] : []),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      `${plan.audioKbps}k`,
      '-movflags',
      '+faststart',
      outputName
    ];
  }

  function createEncodePlan(info: VideoInfo, target: TargetSize): EncodePlan {
    const duration = Math.max(info.duration || 1, 1);
    const totalKbps = Math.floor(
      ((target * MB * 8) / duration / 1000) * TARGET_BITRATE_UTILIZATION
    );
    const preferredAudio = target <= 8 ? 48 : target <= 16 ? 64 : 96;
    const audioKbps = Math.max(32, Math.min(preferredAudio, Math.floor(totalKbps * 0.22)));
    const videoKbps = Math.max(MIN_VIDEO_KBPS, totalKbps - audioKbps);
    const scale = chooseScale(info, videoKbps);

    return {
      audioKbps,
      videoKbps,
      width: scale?.width ?? null,
      height: scale?.height ?? null
    };
  }

  function createSizeAdjustedPlan(
    plan: EncodePlan,
    targetByteSize: number,
    outputByteSize: number
  ): EncodePlan | null {
    if (targetByteSize <= 0 || outputByteSize <= 0) {
      return null;
    }

    const ratio = targetByteSize / outputByteSize;
    if (outputByteSize > targetByteSize && plan.videoKbps > MIN_VIDEO_KBPS + 10) {
      return {
        ...plan,
        videoKbps: Math.max(
          MIN_VIDEO_KBPS,
          Math.floor(plan.videoKbps * ratio * SIZE_RETRY_TIGHTENING)
        )
      };
    }

    if (outputByteSize < targetByteSize * SIZE_RETRY_LOWER_BOUND && ratio > 1) {
      return {
        ...plan,
        videoKbps: Math.max(
          plan.videoKbps + 1,
          Math.floor(plan.videoKbps * ratio * SIZE_RETRY_EXPANSION)
        )
      };
    }

    return null;
  }

  function chooseScale(info: VideoInfo, videoKbps: number) {
    if (!info.width || !info.height) return null;

    const longEdge = Math.max(info.width, info.height);
    const shortEdge = Math.min(info.width, info.height);
    const currentTier = RESOLUTION_TIERS.find((tier) => longEdge >= tier.longEdge);
    const selectedTier =
      RESOLUTION_TIERS.find(
        (tier) => longEdge >= tier.longEdge && videoKbps >= tier.minVideoKbps
      ) ?? RESOLUTION_TIERS[RESOLUTION_TIERS.length - 1];

    if (!currentTier || selectedTier.longEdge >= longEdge) {
      return null;
    }

    const ratio = selectedTier.longEdge / longEdge;
    const scaledLongEdge = makeEven(selectedTier.longEdge);
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
</svelte:head>

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
          <a
            class="grid min-h-8 place-items-center border border-[#fbfbff]/35 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#fbfbff] transition hover:border-[#fbfbff] hover:bg-[#fbfbff] hover:text-[#1713c8] focus:outline-none focus:ring-2 focus:ring-[#fbfbff]"
            href={desktopDownloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            {text.downloadApp}
          </a>
        {/if}

        <div class="flex items-center border border-[#fbfbff]/35" role="group" aria-label={text.languageLabel}>
          {#each languageOptions as option}
            <button
              type="button"
              class={[
                'min-h-8 px-3 text-[10px] font-black uppercase tracking-[0.16em] transition focus:outline-none focus:ring-2 focus:ring-[#fbfbff]',
                locale === option.code
                  ? 'bg-[#fbfbff] text-[#1713c8]'
                  : 'bg-transparent text-[#d8d7ff] hover:bg-[#fbfbff]/15 hover:text-[#fbfbff]'
              ]}
              aria-pressed={locale === option.code}
              onclick={() => setLocale(option.code)}
            >
              {option.label}
            </button>
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
      </div>

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
          <span>{selectedTarget} {text.megabytes}</span>
        </div>
        <div class="mt-3 h-1 w-full bg-[#fbfbff]/20">
          <div
            class="h-full bg-[#fbfbff] transition-[width]"
            style={`width: ${isCompressing || progress === 100 ? progress : 0}%`}
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
