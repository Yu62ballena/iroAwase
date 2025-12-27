'use client';

import React, { useState, useRef, useEffect } from 'react';
import JSZip from 'jszip';

// --- Types ---

interface ImageState {
	file: File;
	url: string;
	element: HTMLImageElement;
	width: number;
	height: number;
}

interface ResultState {
	name: string;
	originalUrl: string;
	resultUrl: string;
	intensity: number; // 0-100, default 50
	id: number;
}

interface ProcessStatus {
	isProcessing: boolean;
	message: string;
	progress: number;
}

// --- Constants & Translations ---

const RESIZE_LONG_EDGE = 3000;
const PREVIEW_EDGE = 1000;
const MAX_TARGET_FILES = 10;
const MAX_FILE_SIZE_MB = 15;

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const DISPLAY_ACCEPTED_FORMATS = "JPG, PNG, WEBP, HEIC";

// Translations
type Language = 'ja' | 'en';

const TRANSLATIONS = {
	ja: {
		subtitle: "写真の色調を、別の写真へ瞬時にコピー。",
		refTitle: "① お手本画像",
		targetTitle: "② 補正する画像",
		targetCount: "枚選択中",
		changeRef: "変更する",
		dropRef: "ここにドロップ\nまたはクリックしてアップロード",
		dropRefSub: "クリックしてアップロード",
		dropTarget: `最大${MAX_TARGET_FILES}枚までドロップ可能\nまたはクリックしてアップロード`,
		dropTargetSub: "クリックしてアップロード",
		btnAdjust: "色調を適用", // Concise Japanese
		btnProcessing: "処理中...",
		btnDownloadZip: "まとめてダウンロード (.zip) 📦",
		btnReset: "リセットして最初に戻る ↺",
		resultsTitle: "変換結果",
		labelOriginal: "元画像",
		labelStandard: "標準",
		labelIntense: "強め",
		msgInvalidExt: "対応していないファイル形式です: ",
		msgTooLarge: "ファイルサイズが大きすぎます（最大15MB）",
		msgHeicFail: "HEICの変換に失敗しました",
		msgLoadFail: "画像の読み込みに失敗しました",
		msgNoValid: "有効な画像が選択されていません",
		msgZipFail: "ZIP作成に失敗しました",
		statusAnalyzing: "参照画像を解析中...",
		statusProcessing: "画像処理中...",
		statusDone: "完了!",
		statusGenZip: "高解像度画像を生成中...",
		statusCreatingZip: "ZIPファイルを作成中...",
		before: "変更前",
		after: "変更後",
		add: "+ 追加"
	},
	en: {
		subtitle: "Transfer the color grade to multiple photos instantly.",
		refTitle: "① Reference Image",
		targetTitle: "② Target Images",
		targetCount: "selected",
		changeRef: "Change Reference",
		dropRef: "Drop reference here\nor click to upload",
		dropRefSub: "or click to upload",
		dropTarget: `Drop up to ${MAX_TARGET_FILES} images\nor click to upload`,
		dropTargetSub: "or click to upload",
		btnAdjust: "Adjust Colors",
		btnProcessing: "Processing...",
		btnDownloadZip: "Download All as ZIP (.zip) 📦",
		btnReset: "Reset All ↺",
		resultsTitle: "Processing Results",
		labelOriginal: "Original",
		labelStandard: "Standard",
		labelIntense: "Intense",
		msgInvalidExt: "Unsupported format: ",
		msgTooLarge: "File too large (Max 15MB)",
		msgHeicFail: "HEIC conversion failed",
		msgLoadFail: "Failed to load image",
		msgNoValid: "No valid images selected",
		msgZipFail: "ZIP creation failed",
		statusAnalyzing: "Analyzing reference...",
		statusProcessing: "Processing image...",
		statusDone: "Done!",
		statusGenZip: "Generating high-res images...",
		statusCreatingZip: "Creating ZIP...",
		before: "Before",
		after: "After",
		add: "+ Add"
	}
};

// Standard Reinhard matrices
const MAT_RGB2LMS = [
	0.3811, 0.5783, 0.0402,
	0.1967, 0.7244, 0.0782,
	0.0241, 0.1288, 0.8444
];
const MAT_LMS2RGB = [
	4.4679, -3.5873, 0.1193,
	-1.2186, 2.3809, -0.1624,
	0.0497, -0.2439, 1.2045
];
const MAT_LMS2LAB = [
	0.5774, 0.5774, 0.5774,
	0.4082, 0.4082, -0.8165,
	0.7071, -0.7071, 0.0000
];
const MAT_LAB2LMS = [
	0.5774, 0.4082, 0.7071,
	0.5774, 0.4082, -0.7071,
	0.5774, -0.8165, 0.0000
];

// --- Helper Functions ---

const loadImage = (src: string): Promise<HTMLImageElement> => {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "Anonymous";
		img.onload = () => resolve(img);
		img.onerror = reject;
		img.src = src;
	});
};

const resizeImageCanvas = (img: HTMLImageElement, longEdge: number = 2400): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number } => {
	const canvas = document.createElement('canvas');
	let width = img.width;
	let height = img.height;

	if (width > longEdge || height > longEdge) {
		if (width > height) {
			height = Math.round(height * (longEdge / width));
			width = longEdge;
		} else {
			width = Math.round(width * (longEdge / height));
			height = longEdge;
		}
	}

	canvas.width = width;
	canvas.height = height;
	// @ts-ignore
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, 0, 0, width, height);
	return { canvas, ctx, width, height };
};

// --- Math & Color Logic ---

const TABLE_sRGBToLinear = new Float32Array(256);
const TABLE_linearToSRGB = new Uint8Array(4096);

for (let i = 0; i < 256; i++) {
	const x = i / 255;
	TABLE_sRGBToLinear[i] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

const sRGBToLinear = (x: number): number => {
	return TABLE_sRGBToLinear[x];
};

const linearToSRGB = (x: number): number => {
	const val = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
	return Math.round(Math.min(255, Math.max(0, val * 255)));
};

const rgb2lab = (r: number, g: number, b: number): [number, number, number] => {
	const rL = TABLE_sRGBToLinear[r];
	const gL = TABLE_sRGBToLinear[g];
	const bL = TABLE_sRGBToLinear[b];

	const EPSILON = 1e-4;
	const L = Math.max(EPSILON, MAT_RGB2LMS[0] * rL + MAT_RGB2LMS[1] * gL + MAT_RGB2LMS[2] * bL);
	const M = Math.max(EPSILON, MAT_RGB2LMS[3] * rL + MAT_RGB2LMS[4] * gL + MAT_RGB2LMS[5] * bL);
	const S = Math.max(EPSILON, MAT_RGB2LMS[6] * rL + MAT_RGB2LMS[7] * gL + MAT_RGB2LMS[8] * bL);

	const l_ = Math.log10(L);
	const m_ = Math.log10(M);
	const s_ = Math.log10(S);

	const l = MAT_LMS2LAB[0] * l_ + MAT_LMS2LAB[1] * m_ + MAT_LMS2LAB[2] * s_;
	const a = MAT_LMS2LAB[3] * l_ + MAT_LMS2LAB[4] * m_ + MAT_LMS2LAB[5] * s_;
	const b_ = MAT_LMS2LAB[6] * l_ + MAT_LMS2LAB[7] * m_ + MAT_LMS2LAB[8] * s_;
	return [l, a, b_];
};

const lab2rgb = (l: number, a: number, b: number): [number, number, number] => {
	const l_ = MAT_LAB2LMS[0] * l + MAT_LAB2LMS[1] * a + MAT_LAB2LMS[2] * b;
	const m_ = MAT_LAB2LMS[3] * l + MAT_LAB2LMS[4] * a + MAT_LAB2LMS[5] * b;
	const s_ = MAT_LAB2LMS[6] * l + MAT_LAB2LMS[7] * a + MAT_LAB2LMS[8] * b;
	const L = Math.pow(10, l_);
	const M = Math.pow(10, m_);
	const S = Math.pow(10, s_);
	const rLine = MAT_LMS2RGB[0] * L + MAT_LMS2RGB[1] * M + MAT_LMS2RGB[2] * S;
	const gLine = MAT_LMS2RGB[3] * L + MAT_LMS2RGB[4] * M + MAT_LMS2RGB[5] * S;
	const bLine = MAT_LMS2RGB[6] * L + MAT_LMS2RGB[7] * M + MAT_LMS2RGB[8] * S;
	return [linearToSRGB(rLine), linearToSRGB(gLine), linearToSRGB(bLine)];
};

interface ColorStats {
	mean: [number, number, number];
	std: [number, number, number];
}

const computeStats = (ctx: CanvasRenderingContext2D, width: number, height: number): ColorStats => {
	const imgData = ctx.getImageData(0, 0, width, height);
	const data = imgData.data;
	const lVals: number[] = [];
	const aVals: number[] = [];
	const bVals: number[] = [];

	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		if (r > 250 && g > 250 && b > 250) continue;
		if (r < 5 && g < 5 && b < 5) continue;
		const [l, a, bb] = rgb2lab(r, g, b);
		lVals.push(l);
		aVals.push(a);
		bVals.push(bb);
	}

	const n = lVals.length;
	if (n === 0) return { mean: [0, 0, 0], std: [1, 1, 1] };
	const meanL = lVals.reduce((a, c) => a + c, 0) / n;
	const meanA = aVals.reduce((a, c) => a + c, 0) / n;
	const meanB = bVals.reduce((a, c) => a + c, 0) / n;
	const varL = lVals.reduce((a, c) => a + Math.pow(c - meanL, 2), 0) / n;
	const varA = aVals.reduce((a, c) => a + Math.pow(c - meanA, 2), 0) / n;
	const varB = bVals.reduce((a, c) => a + Math.pow(c - meanB, 2), 0) / n;
	return {
		mean: [meanL, meanA, meanB],
		std: [Math.sqrt(varL), Math.sqrt(varA), Math.sqrt(varB)]
	};
};

// --- Component ---

export default function ColorTransfer() {
	const [language, setLanguage] = useState<Language>('ja');
	const [reference, setReference] = useState<ImageState | null>(null);
	const [targets, setTargets] = useState<ImageState[]>([]);
	const [results, setResults] = useState<ResultState[]>([]);
	const [processStatus, setProcessStatus] = useState<ProcessStatus>({ isProcessing: false, message: '', progress: 0 });
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Get translation object helper
	const t = TRANSLATIONS[language];

	// Auto-scroll ref
	const resultsRef = useRef<HTMLDivElement>(null);

	// Cache
	const imageCache = useRef<{
		[id: number]: {
			ctx: CanvasRenderingContext2D, // Original preview context (resized)
			width: number,
			height: number,
			tgtStats: ColorStats,
			refStats: ColorStats
		}
	}>({});

	// Throttled update for slider
	const processingRef = useRef<{ [id: number]: boolean }>({});

	// Detect user language on mount
	useEffect(() => {
		const lang = navigator.language || navigator.languages[0];
		if (lang && !lang.toLowerCase().startsWith('ja')) {
			setLanguage('en');
		} else {
			setLanguage('ja');
		}
	}, []);

	// Reset Handler
	const handleReset = () => {
		setReference(null);
		setTargets([]);
		setResults([]);
		setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		setErrorMessage(null);
		setImageCache({});
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const validateAndProcessFile = async (file: File): Promise<File | Blob | null> => {
		// 1. Check Extension
		const hasValidExt = ACCEPTED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
		if (!hasValidExt) {
			console.warn("Invalid extension:", file.name);
			return null;
		}

		// 2. Check Size
		if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
			console.warn("File too large:", file.name);
			return null;
		}

		// 3. Handle HEIC/HEIF
		const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');
		if (isHeic) {
			try {
				const heic2any = (await import('heic2any')).default;
				const convertedBlob = await heic2any({
					blob: file,
					toType: "image/jpeg",
					quality: 0.9
				});
				if (Array.isArray(convertedBlob)) return convertedBlob[0];
				return convertedBlob;
			} catch (err) {
				console.error("HEIC conversion failed", err);
				return null;
			}
		}

		return file;
	};

	const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLElement>, type: 'reference' | 'target') => {
		e.preventDefault();
		let fileList: FileList | null = null;
		if ('dataTransfer' in e) {
			fileList = e.dataTransfer.files;
		} else if ('target' in e && e.target instanceof HTMLInputElement) {
			fileList = e.target.files;
		}

		if (!fileList || fileList.length === 0) return;

		setErrorMessage(null);
		const filesArray = Array.from(fileList);

		// Validate Types
		const unsupportedFiles = filesArray.filter(f => !ACCEPTED_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext)));
		if (unsupportedFiles.length > 0) {
			const names = unsupportedFiles.map(f => f.name).join(', ');
			setErrorMessage(`${t.msgInvalidExt}${names}`);
		}

		if (type === 'reference') {
			const originalFile = filesArray[0];

			setProcessStatus({ isProcessing: true, message: t.statusAnalyzing, progress: 0 });

			const processedFile = await validateAndProcessFile(originalFile);

			if (!processedFile) {
				if (!errorMessage) setErrorMessage(t.msgTooLarge);
				setProcessStatus({ isProcessing: false, message: '', progress: 0 });
				return;
			}

			const fileObj = processedFile instanceof File ? processedFile : new File([processedFile], originalFile.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
			const url = URL.createObjectURL(fileObj);

			try {
				const img = await loadImage(url);
				if (img.width === 0 || img.height === 0) throw new Error("Image has 0 dimensions");
				setReference({ file: fileObj, url, element: img, width: img.width, height: img.height });
			} catch (err) {
				console.error("Reference load error:", err);
				setErrorMessage(t.msgLoadFail);
				URL.revokeObjectURL(url);
			}
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });

		} else {
			// Target: Multi-select
			setProcessStatus({ isProcessing: true, message: t.statusProcessing, progress: 0 });

			const newTargets: ImageState[] = [];
			const failedLoads: string[] = [];

			const candidates = filesArray.slice(0, MAX_TARGET_FILES); // process up to N

			for (const file of candidates) {
				const processedFile = await validateAndProcessFile(file);
				if (processedFile) {
					const fileObj = processedFile instanceof File ? processedFile : new File([processedFile], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
					const url = URL.createObjectURL(fileObj);
					try {
						const img = await loadImage(url);
						if (img.width === 0 || img.height === 0) throw new Error("Image has 0 dimensions");
						newTargets.push({ file: fileObj, url, element: img, width: img.width, height: img.height });
					} catch (err) {
						console.error("Failed image load", file.name, err);
						failedLoads.push(file.name);
						URL.revokeObjectURL(url);
					}
				}
			}

			if (failedLoads.length > 0) {
				const msg = `${t.msgLoadFail}: ${failedLoads.join(', ')}`;
				setErrorMessage(prev => prev ? `${prev} | ${msg}` : msg);
			}

			if (newTargets.length === 0 && filesArray.length > 0 && failedLoads.length === 0 && unsupportedFiles.length === 0) {
				if (!errorMessage) setErrorMessage(t.msgNoValid);
			} else {
				setTargets(prev => [...prev, ...newTargets].slice(0, MAX_TARGET_FILES));
			}

			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	// Apply color transfer with variable intensity
	const processImageBuffer = (
		imgData: ImageData,
		refStats: ColorStats,
		tgtStats: ColorStats,
		intensity: number // 0 to 100, 50 = standard
	): ImageData => {
		const data = imgData.data;
		// Clone data for output (don't mutate original if cached)
		const output = new ImageData(new Uint8ClampedArray(data), imgData.width, imgData.height);
		const outData = output.data;

		// Calculate interpolation factor, 0-100 -> 0.0-2.0
		const k = intensity / 50.0;

		// Pre-calculate global constants for speed
		const scaleL_std = (tgtStats.std[0] !== 0) ? Math.min(3.0, Math.max(0.3, refStats.std[0] / tgtStats.std[0])) : 1;
		const L_BOOST = 0.03;

		const refSatLvl = (refStats.std[1] + refStats.std[2]) / 2;
		const tgtSatLvl = (tgtStats.std[1] + tgtStats.std[2]) / 2;
		let globalSatScale_std = (tgtSatLvl !== 0) ? refSatLvl / tgtSatLvl : 1;
		globalSatScale_std = Math.min(1.25, Math.max(0.3, globalSatScale_std));

		// Coefficients
		const A_L = 1 + (scaleL_std - 1) * k;
		const B_L = (refStats.mean[0] + L_BOOST - tgtStats.mean[0] * scaleL_std) * k;

		const scaleSat = 1 + (globalSatScale_std - 1) * k;
		const offsetSatA = tgtStats.mean[1] * (1 - scaleSat);
		const offsetSatB = tgtStats.mean[2] * (1 - scaleSat);

		for (let i = 0; i < outData.length; i += 4) {
			const [l, a, b] = rgb2lab(outData[i], outData[i + 1], outData[i + 2]);

			// Apply linear transform
			const l_new = l * A_L + B_L;
			const a_new = a * scaleSat + offsetSatA;
			const b_new = b * scaleSat + offsetSatB;

			const [r, g, bb] = lab2rgb(l_new, a_new, b_new);
			outData[i] = r;
			outData[i + 1] = g;
			outData[i + 2] = bb;
		}

		return output;
	};

	const executeColorTransfer = async () => {
		if (!reference || targets.length === 0) return;

		setProcessStatus({ isProcessing: true, message: t.statusAnalyzing, progress: 5 });
		setImageCache({}); // Clear cache

		try {
			const refResized = resizeImageCanvas(reference.element, RESIZE_LONG_EDGE);
			const refStats = computeStats(refResized.ctx, refResized.width, refResized.height);

			const newResults: ResultState[] = [];

			for (let i = 0; i < targets.length; i++) {
				const currentProgress = 10 + Math.round((i / targets.length) * 85);
				setProcessStatus({
					isProcessing: true,
					message: `${t.statusProcessing} (${i + 1}/${targets.length})`,
					progress: currentProgress
				});

				// 1. Prepare preview size
				const previewResized = resizeImageCanvas(targets[i].element, PREVIEW_EDGE);
				const tgtStats = computeStats(previewResized.ctx, previewResized.width, previewResized.height);

				// 2. Cache original data for slider updates
				imageCache.current[i] = {
					ctx: previewResized.ctx,
					width: previewResized.width,
					height: previewResized.height,
					tgtStats: tgtStats,
					refStats: refStats
				};

				// 3. Process initial result (Intensity 50)
				const imgData = previewResized.ctx.getImageData(0, 0, previewResized.width, previewResized.height);
				const processed = processImageBuffer(imgData, refStats, tgtStats, 50); // Default 50

				// Draw to canvas to get URL
				const canvas = document.createElement('canvas');
				canvas.width = previewResized.width;
				canvas.height = previewResized.height;
				const ctx = canvas.getContext('2d')!;
				ctx.putImageData(processed, 0, 0);

				newResults.push({
					name: targets[i].file.name,
					originalUrl: targets[i].url,
					resultUrl: canvas.toDataURL('image/jpeg', 0.9),
					intensity: 50,
					id: i
				});

				await new Promise(r => setTimeout(r, 20)); // Yield to UI
			}

			setResults(newResults);
			setProcessStatus({ isProcessing: false, message: t.statusDone, progress: 100 });

			// Auto scroll to results
			setTimeout(() => {
				resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
			}, 100);

		} catch (e) {
			console.error(e);
			setErrorMessage("Processing failed.");
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	const handleIntensityChange = (index: number, val: number) => {
		setResults(prev => prev.map((res, i) => i === index ? { ...res, intensity: val } : res));

		if (processingRef.current[index]) return;
		processingRef.current[index] = true;

		requestAnimationFrame(() => {
			const cache = imageCache.current[results[index].id];
			if (!cache) return;

			const imgData = cache.ctx.getImageData(0, 0, cache.width, cache.height);
			const processed = processImageBuffer(imgData, cache.refStats, cache.tgtStats, val);

			const canvas = document.createElement('canvas');
			canvas.width = cache.width;
			canvas.height = cache.height;
			const ctx = canvas.getContext('2d')!;
			ctx.putImageData(processed, 0, 0);

			const newUrl = canvas.toDataURL('image/jpeg', 0.8);

			setResults(prev => prev.map((res, i) => i === index ? { ...res, resultUrl: newUrl } : res));
			processingRef.current[index] = false;
		});
	};

	function setImageCache(arg0: {}) {
		imageCache.current = arg0;
	}

	const handleDownloadZip = async () => {
		if (!reference || targets.length === 0 || results.length === 0) return;

		setProcessStatus({ isProcessing: true, message: t.statusGenZip, progress: 10 });

		try {
			const zip = new JSZip();
			const refResized = resizeImageCanvas(reference.element, RESIZE_LONG_EDGE);
			const refStats = computeStats(refResized.ctx, refResized.width, refResized.height);

			for (let i = 0; i < targets.length; i++) {
				const res = results[i];
				setProcessStatus({
					isProcessing: true,
					message: `${res.name}...`,
					progress: 10 + Math.round((i / targets.length) * 80)
				});

				// Resize target
				const tgtResized = resizeImageCanvas(targets[i].element, RESIZE_LONG_EDGE);
				const tgtStats = computeStats(tgtResized.ctx, tgtResized.width, tgtResized.height);

				// Process FULL size with current intensity slider value
				const imgData = tgtResized.ctx.getImageData(0, 0, tgtResized.width, tgtResized.height);
				const processed = processImageBuffer(imgData, refStats, tgtStats, res.intensity);

				const canvas = document.createElement('canvas');
				canvas.width = tgtResized.width;
				canvas.height = tgtResized.height;
				const ctx = canvas.getContext('2d')!;
				ctx.putImageData(processed, 0, 0);

				const fullResUrl = canvas.toDataURL('image/jpeg', 0.92);
				const data = fullResUrl.split(',')[1];
				zip.file(targets[i].file.name.replace(/\.[^/.]+$/, "") + "_adjusted.jpg", data, { base64: true });
			}

			setProcessStatus({ isProcessing: true, message: t.statusCreatingZip, progress: 95 });
			const content = await zip.generateAsync({ type: 'blob' });
			const link = document.createElement('a');
			link.href = URL.createObjectURL(content);
			link.download = "color_adjusted_images.zip";
			link.click();

			setProcessStatus({ isProcessing: false, message: t.statusDone, progress: 100 });
		} catch (e) {
			console.error(e);
			setErrorMessage(t.msgZipFail);
			setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		}
	};

	return (
		<div className="w-full md:w-[90%] lg:w-[85%] max-w-[1800px] mx-auto py-8 space-y-8 relative">
			{/* Language Switcher */}
			<div className="absolute top-0 right-4 md:right-0">
				<div className="flex bg-gray-800/50 backdrop-blur-sm rounded-lg p-1 text-xs font-bold border border-gray-700/50">
					<button
						onClick={() => setLanguage('ja')}
						className={`px-3 py-1.5 rounded-md transition-all ${language === 'ja' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
					>
						JP
					</button>
					<button
						onClick={() => setLanguage('en')}
						className={`px-3 py-1.5 rounded-md transition-all ${language === 'en' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
					>
						EN
					</button>
				</div>
			</div>

			{/* Header */}
			<div className="flex flex-col items-center gap-2 mt-8 md:mt-0 pb-4">
				<div className="flex items-center justify-center gap-3 md:gap-4 select-none">
					<img src="/logo.png" alt="iroAwase Logo" className="h-10 w-10 md:h-16 md:w-16 object-contain" />
					<h1 className="text-3xl md:text-5xl text-white tracking-wider pb-1" style={{ fontFamily: 'var(--font-comfortaa)' }}>
						iroAwase
					</h1>
				</div>
				<p className="text-gray-400 text-sm md:text-base">{t.subtitle}</p>
			</div>

			{/* Main Drop Zones */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10 items-start relative px-4 md:px-0">
				{/* Reference */}
				<div className="flex flex-col gap-2">
					<h2 className="text-gray-300 text-sm flex items-center justify-between">
						<span className="flex items-center gap-2">{t.refTitle}</span>
						<span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">{DISPLAY_ACCEPTED_FORMATS}</span>
					</h2>
					<div
						className="bg-[#C4C4C4] rounded-2xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-700 overflow-hidden group cursor-pointer"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'reference')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={(e) => handleFileSelect(e, 'reference')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{reference ? (
							<div className="flex flex-col items-center justify-center w-full h-full p-6 gap-3">
								<img src={reference.url} alt="Reference" className="max-w-full max-h-[85%] object-contain shadow-sm rounded-sm z-10" />
								<p className="text-xs text-gray-600 font-medium bg-white/50 px-2 py-1 rounded backdrop-blur-sm group-hover:bg-white/80 transition-colors z-10">
									{t.changeRef}
								</p>
							</div>
						) : (
							<div className="flex flex-col items-center gap-1 pointer-events-none group-hover:scale-105 transition-transform duration-200">
								<p className="text-sm font-medium transition-colors duration-200 group-hover:text-blue-600 text-center leading-relaxed whitespace-pre-wrap">
									{t.dropRef}<br />
								</p>
							</div>
						)}
					</div>
				</div>

				{/* Target */}
				<div className="flex flex-col gap-2">
					<h2 className="text-gray-300 text-sm flex items-center justify-between">
						<span className="flex items-center gap-2">{t.targetTitle}</span>
						<div className="flex items-center gap-2">
							<span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1.5 py-0.5">{DISPLAY_ACCEPTED_FORMATS}</span>
							{targets.length > 0 && <span className="text-xs text-indigo-400">{targets.length} {t.targetCount}</span>}
						</div>
					</h2>
					<div
						className="bg-[#C4C4C4] rounded-2xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-700 overflow-hidden group cursor-pointer"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'target')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} multiple onChange={(e) => handleFileSelect(e, 'target')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{targets.length > 0 ? (
							<div className="p-4 w-full h-full z-10 overflow-y-auto">
								<div className="grid grid-cols-5 gap-2">
									{targets.map((tgt, i) => (
										<div key={i} className="relative aspect-square bg-black/10 rounded-lg overflow-hidden border border-white/20 shadow-sm">
											<img src={tgt.url} className="w-full h-full object-cover" alt={`target-${i}`} />
										</div>
									))}
									<div className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-400/50 rounded-lg text-[10px] text-gray-600 font-medium bg-white/30 hover:bg-white/50 transition-colors">
										{t.add}
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center gap-1 pointer-events-none group-hover:scale-105 transition-transform duration-200">
								<p className="text-sm font-medium transition-colors duration-200 group-hover:text-blue-600 text-center leading-relaxed whitespace-pre-wrap">
									{t.dropTarget}
								</p>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Action Area */}
			<div className="flex flex-col items-center justify-center gap-6 py-4">
				{errorMessage && (
					<div className="bg-red-500/10 text-red-400 px-4 py-2 rounded-lg border border-red-500/20 text-sm">
						{errorMessage}
					</div>
				)}

				<button
					onClick={executeColorTransfer}
					disabled={!reference || targets.length === 0 || processStatus.isProcessing}
					className="px-32 py-6 rounded-xl font-bold text-2xl text-white shadow-xl bg-[#4299E1] hover:bg-[#3182CE] transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap"
				>
					{processStatus.isProcessing ? t.btnProcessing : t.btnAdjust}
				</button>

				{/* Progress */}
				{(processStatus.isProcessing || processStatus.progress > 0) && (
					<div className="w-full max-w-[500px] space-y-2 pt-2 px-4">
						<div className="flex justify-between text-sm font-medium text-gray-400">
							<span>{processStatus.message}</span>
							<span>{processStatus.progress}%</span>
						</div>
						<div className="h-3 w-full bg-gray-800 rounded-full overflow-hidden border border-gray-700">
							<div
								className="h-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-300 ease-out"
								style={{ width: `${processStatus.progress}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Result Area */}
			{results.length > 0 && (
				<div ref={resultsRef} className="animate-slide-up space-y-8 pt-8 border-t border-gray-800 scroll-mt-8">
					<div className="flex flex-col md:flex-row items-center justify-between gap-4 px-4">
						<h3 className="text-3xl font-bold text-gray-200">{t.resultsTitle}</h3>
						<button
							onClick={handleDownloadZip}
							disabled={processStatus.isProcessing}
							className="w-full md:w-auto px-10 py-4 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 shadow-2xl active:scale-95 whitespace-nowrap"
						>
							{t.btnDownloadZip}
						</button>
					</div>

					<div className="space-y-12 pb-8">
						{results.map((res, i) => (
							<div key={i} className="space-y-6 bg-white/5 py-6 rounded-none md:rounded-3xl border-y md:border border-white/10 md:mx-4">
								<div className="flex justify-between items-center px-6">
									<h4 className="text-gray-400 font-medium">Image {i + 1}: {res.name}</h4>
								</div>

								{/* Result Comparison */}
								<div className="flex flex-row items-center justify-center gap-2 md:gap-8 lg:gap-12 px-2 md:px-6">
									{/* Before */}
									<div className="flex flex-col items-center gap-3 flex-1">
										<div className="relative group w-full">
											<img src={res.originalUrl} className="w-full h-auto rounded-lg md:rounded-xl shadow-lg grayscale-[0.3] brightness-90" alt="Before" />
											<span className="absolute top-2 left-2 md:top-4 md:left-4 bg-black/60 backdrop-blur-md text-white text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5 rounded-full font-bold uppercase tracking-wider">{t.before}</span>
										</div>
									</div>

									{/* Arrow */}
									<div className="text-indigo-500/50 hidden sm:block">
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6 md:w-12 md:h-12">
											<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
										</svg>
									</div>

									{/* After */}
									<div className="flex flex-col items-center gap-3 flex-1">
										<div className="relative w-full">
											<img src={res.resultUrl} className="w-full h-auto rounded-lg md:rounded-xl shadow-[0_20px_50px_rgba(66,153,225,0.2)]" alt="After" />
											<span className="absolute top-2 left-2 md:top-4 md:left-4 bg-blue-500 text-white text-[10px] md:text-xs px-2 py-1 md:px-3 md:py-1.5 rounded-full font-bold uppercase tracking-wider ring-2 md:ring-4 ring-blue-500/20">{t.after}</span>
										</div>
									</div>
								</div>

								{/* Slider Control */}
								<div className="max-w-[800px] mx-auto w-full pt-2 px-6">
									<div className="flex flex-col gap-2">
										<div className="flex justify-between text-xs md:text-sm text-gray-400 font-medium">
											<span>{t.labelOriginal}</span>
											<span className="text-blue-400">{t.labelStandard}</span>
											<span>{t.labelIntense}</span>
										</div>
										<div className="flex items-center gap-4">
											<input
												type="range"
												min="0"
												max="100"
												value={res.intensity}
												onChange={(e) => handleIntensityChange(i, parseInt(e.target.value))}
												className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 touch-pan-x"
											/>
											<span className="w-8 text-center font-mono text-gray-300 text-sm">{res.intensity}</span>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>

					<div className="flex flex-col items-center justify-center pt-4 px-4 gap-8 pb-12">
						<button
							onClick={handleDownloadZip}
							disabled={processStatus.isProcessing}
							className="w-full md:w-auto px-16 py-6 bg-blue-600 text-white rounded-xl md:rounded-2xl font-bold text-lg md:text-xl hover:bg-blue-500 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-blue-500/20 active:scale-95 whitespace-nowrap"
						>
							{t.btnDownloadZip}
						</button>

						{/* Reset Button */}
						<button
							onClick={handleReset}
							className="text-gray-500 hover:text-white transition-colors text-sm md:text-base font-medium flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-white/10"
						>
							{t.btnReset}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
