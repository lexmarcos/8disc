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
  type EncodePlan = {
    videoKbps: number;
    audioKbps: number;
    width: number | null;
  };

  const translations = {
    en: {
      htmlLang: 'en',
      metaTitle: '8disc - Local video compressor',
      metaDescription: 'Compress videos locally to 8 MB, 16 MB, 25 MB, 50 MB, or 100 MB.',
      headerMeta: 'local / wasm / mp4',
      languageLabel: 'Language',
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
        compressingLocal: 'Compressing locally',
        adjustingTarget: 'Tuning for the target',
        fileReady: 'File ready',
        fileReadyOversized: 'File ready, above target',
        compressionFailed: 'Compression failed'
      },
      errors: {
        invalidFile: 'Upload a video file.',
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
      languageLabel: 'Idioma',
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
        compressingLocal: 'Comprimindo localmente',
        adjustingTarget: 'Ajustando para a meta',
        fileReady: 'Arquivo pronto',
        fileReadyOversized: 'Arquivo pronto, acima da meta',
        compressionFailed: 'Falha na compressao'
      },
      errors: {
        invalidFile: 'Envie um arquivo de video.',
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

  let locale: Locale = 'en';
  let selectedTarget: TargetSize = 16;
  let videoFile: File | null = null;
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

  $: text = translations[locale];
  $: canCompress = Boolean(videoFile) && !isLoadingEngine && !isCompressing;
  $: targetBytes = selectedTarget * MB;
  $: inputSize = videoFile ? formatBytes(videoFile.size) : '';
  $: outputSize = compressedSize ? formatBytes(compressedSize) : '';
  $: engineLabel = isLoadingEngine
    ? text.status.preparingFfmpeg
    : isCompressing
      ? text.progress(progress)
      : text.status[statusKey];
  $: errorText = errorKey ? text.errors[errorKey] : '';

  onMount(() => {
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

  async function handleFileInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    await selectFile(input.files?.[0] ?? null);
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
    clearCompressedOutput();

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
    statusKey = 'readingMetadata';

    try {
      videoInfo = await readVideoInfo(file);
      statusKey = 'ready';
    } catch {
      videoInfo = null;
      statusKey = 'ready';
    }
  }

  async function compressVideo() {
    if (!videoFile) return;

    errorKey = '';
    clearCompressedOutput();
    isLoadingEngine = true;
    isCompressing = false;
    progress = 0;

    try {
      const encoder = await loadEncoder();
      const helper = fetchFile;

      if (!helper) {
        errorKey = 'readerFailed';
        throw new Error('file-reader-unavailable');
      }

      isLoadingEngine = false;
      isCompressing = true;
      statusKey = 'calculating';

      const info = videoInfo ?? (await readVideoInfo(videoFile));
      const inputName = `input.${getExtension(videoFile.name)}`;
      const outputName = 'output.mp4';
      const basePlan = createEncodePlan(info, selectedTarget);

      await safeDelete(encoder, inputName);
      await safeDelete(encoder, outputName);
      await encoder.writeFile(inputName, await helper(videoFile));

      statusKey = 'compressingLocal';
      let result = await runEncode(encoder, inputName, outputName, basePlan);
      let resultBlob = createVideoBlob(result);

      if (resultBlob.size > targetBytes && basePlan.videoKbps > 90) {
        statusKey = 'adjustingTarget';
        const ratio = targetBytes / resultBlob.size;
        const tighterPlan = {
          ...basePlan,
          videoKbps: Math.max(80, Math.floor(basePlan.videoKbps * ratio * 0.88))
        };
        result = await runEncode(encoder, inputName, outputName, tighterPlan);
        resultBlob = createVideoBlob(result);
      }

      compressedUrl = URL.createObjectURL(resultBlob);
      compressedSize = resultBlob.size;
      compressedName = `${withoutExtension(videoFile.name)}-${selectedTarget}mb.mp4`;
      progress = 100;
      statusKey = resultBlob.size <= targetBytes ? 'fileReady' : 'fileReadyOversized';

      await safeDelete(encoder, inputName);
      await safeDelete(encoder, outputName);
    } catch (error) {
      if (!errorKey) {
        errorKey = 'compressFailed';
      }
      statusKey = 'compressionFailed';
      progress = 0;
    } finally {
      isLoadingEngine = false;
      isCompressing = false;
    }
  }

  async function loadEncoder() {
    if (ffmpeg && fetchFile) {
      return ffmpeg;
    }

    statusKey = 'loadingFfmpeg';

    const [{ FFmpeg }, util, core, wasm] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
      import('@ffmpeg/core?url'),
      import('@ffmpeg/core/wasm?url')
    ]);

    const instance = new FFmpeg();
    instance.on('progress', ({ progress: ratio }) => {
      if (isCompressing) {
        progress = Math.max(1, Math.min(99, Math.round(ratio * 100)));
      }
    });

    await instance.load({
      coreURL: core.default,
      wasmURL: wasm.default
    });

    ffmpeg = instance;
    fetchFile = util.fetchFile as FetchFile;
    return instance;
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
      ...(plan.width ? ['-vf', `scale=${plan.width}:-2`] : []),
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
    const totalKbps = Math.floor(((target * MB * 8) / duration / 1000) * 0.9);
    const preferredAudio = target <= 8 ? 48 : target <= 16 ? 64 : 96;
    const audioKbps = Math.max(32, Math.min(preferredAudio, Math.floor(totalKbps * 0.22)));
    const videoKbps = Math.max(80, totalKbps - audioKbps);
    const maxWidth = target <= 8 ? 640 : target <= 16 ? 720 : target <= 25 ? 960 : target <= 50 ? 1280 : 1920;
    const width = info.width ? makeEven(Math.min(info.width, maxWidth)) : null;

    return {
      audioKbps,
      videoKbps,
      width
    };
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
    compressedSize = 0;
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

  function makeEven(value: number) {
    const rounded = Math.max(2, Math.floor(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
  }
</script>

<svelte:head>
  <title>{text.metaTitle}</title>
  <meta name="description" content={text.metaDescription} />
</svelte:head>

<main class="relative min-h-screen overflow-hidden bg-[#1713c8] px-4 py-4 text-[#fbfbff] sm:px-6">
  <div
    class="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:72px_72px]"
  ></div>
  <div class="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#fbfbff]/40"></div>

  <div class="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col">
    <header class="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[#d8d7ff]">
      <a class="block size-14 shrink-0 sm:size-16" href="/" aria-label="8disc">
        <img class="size-full object-contain" src="/Logo.svg" alt="8disc" />
      </a>
      <span class="hidden sm:inline">{text.headerMeta}</span>
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
        <label
          class={[
            'group flex min-h-48 w-full cursor-pointer flex-col items-center justify-center border border-dashed bg-[#1110aa]/50 p-6 text-center transition',
            isDragging
              ? 'border-[#fbfbff] bg-[#fbfbff] text-[#1713c8]'
              : 'border-[#fbfbff]/45 hover:border-[#fbfbff] hover:bg-[#1c18d7]'
          ]}
          aria-label={text.uploadAria}
          ondragover={handleDragOver}
          ondragleave={handleDragLeave}
          ondrop={handleDrop}
        >
          <input
            bind:this={fileInput}
            class="sr-only"
            type="file"
            accept="video/*"
            onchange={handleFileInput}
          />

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

          {#if videoFile}
            <span class="max-w-full truncate text-lg font-black">{videoFile.name}</span>
            <span class="mt-2 text-sm text-[#d8d7ff]">{inputSize}</span>
          {:else}
            <span class="text-lg font-black">{text.uploadTitle}</span>
            <span class="mt-2 text-sm text-[#d8d7ff]">{text.uploadSubtitle}</span>
          {/if}
        </label>
      </div>

      <div class="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-5" aria-label={text.targetAria}>
        {#each targetSizes as size}
          <button
            type="button"
            class={[
              'min-h-20 border px-3 text-left transition focus:outline-none focus:ring-2 focus:ring-[#fbfbff]',
              selectedTarget === size
                ? 'border-[#fbfbff] bg-[#fbfbff] text-[#1713c8] shadow-[6px_6px_0_rgba(255,255,255,.18)]'
                : 'border-[#fbfbff]/35 bg-[#1410bd]/70 text-[#fbfbff] hover:border-[#fbfbff] hover:bg-[#1c18d7]'
            ]}
            aria-pressed={selectedTarget === size}
            onclick={() => (selectedTarget = size)}
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
        {/if}
      </div>

      <div class="w-full max-w-2xl" aria-live="polite">
        <div class="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-[#d8d7ff]">
          <span>{engineLabel}</span>
          <span>{selectedTarget} {text.megabytes}</span>
        </div>
        <div class="mt-3 h-1 w-full bg-[#fbfbff]/20">
          <div
            class="h-full bg-[#fbfbff] transition-[width]"
            style={`width: ${isCompressing || progress === 100 ? progress : 0}%`}
          ></div>
        </div>
        {#if errorText}
          <p class="mt-3 border border-[#fbfbff]/40 bg-[#fbfbff] px-4 py-3 text-sm font-bold text-[#1713c8]">
            {errorText}
          </p>
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
