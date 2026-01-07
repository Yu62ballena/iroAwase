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
		subtitle: "写真の色調を、別の写真へ瞬時にコピー",
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
		add: "+ 追加",
		menu_app_desc: "写真の色調を、別の写真へ瞬時にコピーするAIカラーグレーディングツール。",
		menu_related: "関連ツール",
		menu_karukusuru_desc: "画質そのまま、ファイルだけ軽くするツール。",
		menu_open: "開く",
		menu_about: "iroAwase について",
		menu_privacy: "・画像はサーバーに保存されません",
		menu_client_side: "・すべての処理はブラウザ上で完結します",
		modal_reset_title: "全てリセットしますか？",
		modal_reset_desc: "アップロードした画像と設定がすべて消去されます。この操作は取り消せません。",
		modal_cancel: "キャンセル",
		modal_confirm: "リセットする"
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
		add: "+ Add",
		menu_app_desc: "AI color grading tool that instantly transfers color tones between photos.",
		menu_related: "Related Tools",
		menu_karukusuru_desc: "Reduce file size while keeping quality high.",
		menu_open: "Open",
		menu_about: "About iroAwase",
		menu_privacy: "• Images are not saved on the server",
		menu_client_side: "• All processing is done on your browser",
		modal_reset_title: "Reset Everything?",
		modal_reset_desc: "This will clear all uploaded images and settings. This action cannot be undone.",
		modal_cancel: "Cancel",
		modal_confirm: "Reset All"
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
		// if (r > 250 && g > 250 && b > 250) continue; // Remove highlight filter
		// if (r < 5 && g < 5 && b < 5) continue; // Remove shadow filter
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
	const stdL = Math.sqrt(varL);
	const stdA = Math.sqrt(varA);
	const stdB = Math.sqrt(varB);

	console.log('Target Stats:', {
		mean: [meanL, meanA, meanB],
		std: [stdL, stdA, stdB],
		pixelCount: n,
		totalPixels: width * height
	});
	return {
		mean: [meanL, meanA, meanB],
		std: [stdL, stdA, stdB]
	};
};

// --- Component ---

export default function ColorTransfer() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const [isResetModalOpen, setIsResetModalOpen] = useState(false);
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

	// Reset Handler (Actual reset)
	const performReset = () => {
		setReference(null);
		setTargets([]);
		setResults([]);
		setProcessStatus({ isProcessing: false, message: '', progress: 0 });
		setErrorMessage(null);
		setImageCache({});
		setIsResetModalOpen(false);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const handleResetClick = () => {
		if (reference || targets.length > 0) {
			setIsResetModalOpen(true);
		}
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
		// ユーザーフィードバック: 強度30くらいがベストとのこと。
		// 以前は 50.0 で割っていた (強度50 = k1.0)
		// 今回は「強度50のときに、以前の強度30相当」になるように調整する。
		// 30 / 50 = 0.6 なので、 50 / x = 0.6 -> x = 83.33...
		// 約80.0で割れば、スライダー50のときに以前の0.625倍相当になり、マイルドになる。
		const k = intensity / 80.0;

		// Pre-calculate global constants for speed
		// ターゲット画像の標準偏差が極端に小さい場合、倍率が暴走して色が破綻するのを防ぐため、
		// 倍率に上限(CAP)を設ける。
		const SCALE_CAP = 3.0; // 最大3倍まで（5.0から厳しくした）

		// ■ ユーザー要望対応: 彩度(標準偏差)の上限キャップ
		// お手本画像の彩度が強すぎる(stdが大きい)場合、その強さをそのまま適用すると色が破綻する。
		// そのため、計算に使うお手本の彩度値に上限を設け、「彩度100のお手本が来ても50として扱う」ような処理を行う。
		// Log空間なので値は小さい(0.15は安全側だが、青空などの綺麗な色が出にくいので0.18に緩和)
		const REF_STD_CAP = 0.18;

		const effectiveRefStdL = Math.min(refStats.std[0], REF_STD_CAP);
		const effectiveRefStdA = Math.min(refStats.std[1], REF_STD_CAP);
		const effectiveRefStdB = Math.min(refStats.std[2], REF_STD_CAP);

		// 生の倍率 (Cap済みのお手本stdを使用)
		const rawScaleL = (tgtStats.std[0] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdL / tgtStats.std[0]) : 1;
		const rawScaleA = (tgtStats.std[1] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdA / tgtStats.std[1]) : 1;
		const rawScaleB = (tgtStats.std[2] > 0.01) ? Math.min(SCALE_CAP, effectiveRefStdB / tgtStats.std[2]) : 1;

		// Soft Reinhard: コントラスト（stdの比）を完全に適用せず、元の画像との中間にする
		// 例: 0.5 = 元のコントラストと、お手本のコントラストの中間
		const BLEND_STD = 0.5;
		const scaleL_std = 1.0 + (rawScaleL - 1.0) * BLEND_STD;
		const scaleA_std = 1.0 + (rawScaleA - 1.0) * BLEND_STD;
		const scaleB_std = 1.0 + (rawScaleB - 1.0) * BLEND_STD;

		console.log('Scaling Factors (Soft+RefCap):', { scaleL_std, scaleA_std, scaleB_std, refCap: REF_STD_CAP });

		// Soft Reinhard: 平均値のシフト（明るさ・色味の変更）も和らげる
		// 1.0 = 完全にお手本に合わせる, 0.5 = 元の明るさを半分残す
		const BLEND_MEAN_L = 0.5; // 白飛び抑制のため少し下げる (0.6 -> 0.5)
		const BLEND_MEAN_C = 0.6; // 色味も6割程度

		// Coefficients
		const A_L = 1 + (scaleL_std - 1) * k;
		const B_L = (refStats.mean[0] - tgtStats.mean[0] * scaleL_std) * k * BLEND_MEAN_L;

		const A_a = 1 + (scaleA_std - 1) * k;
		const B_a = (refStats.mean[1] - tgtStats.mean[1] * scaleA_std) * k * BLEND_MEAN_C;

		const A_b = 1 + (scaleB_std - 1) * k;
		const B_b = (refStats.mean[2] - tgtStats.mean[2] * scaleB_std) * k * BLEND_MEAN_C;

		// Apply linear transform
		// Note: 標準の式は L_new = (L_old - Tgt_Mean) * Scale + Ref_Mean
		// 展開すると: L_new = L_old * Scale + (Ref_Mean - Tgt_Mean * Scale)
		// 今回は後半のオフセット項(B_L, B_a, B_b)にBLEND係数を掛けて弱めている

		for (let i = 0; i < outData.length; i += 4) {
			const [l, a, b] = rgb2lab(outData[i], outData[i + 1], outData[i + 2]);

			const l_new = l * A_L + B_L;
			const a_new = a * A_a + B_a;
			const b_new = b * A_b + B_b;

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
			{/* Reset Confirmation Modal */}
			{isResetModalOpen && (
				<div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => setIsResetModalOpen(false)}
					/>
					<div className="relative bg-[#1e1e24]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in zoom-in-95 duration-200 ring-1 ring-white/5">
						<h3 className="text-xl font-bold text-white mb-2 tracking-tight">
							{(t as any).modal_reset_title}
						</h3>
						<p className="text-gray-400 mb-8 leading-relaxed text-sm">
							{(t as any).modal_reset_desc}
						</p>
						<div className="flex gap-3 justify-end">
							<button
								onClick={() => setIsResetModalOpen(false)}
								className="px-4 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-bold text-sm"
							>
								{(t as any).modal_cancel}
							</button>
							<button
								onClick={performReset}
								className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white font-bold shadow-lg shadow-red-900/40 transition-all transform hover:-translate-y-0.5 active:scale-95 text-sm"
							>
								{(t as any).modal_confirm}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Hamburger Menu Button */}
			<div className="absolute top-0 left-4 md:left-0 z-50">
				<button
					onClick={() => setIsMenuOpen(true)}
					className="p-2 text-white/50 hover:text-white transition-colors active:scale-95"
					aria-label="Menu"
				>
					<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
						<path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
					</svg>
				</button>
			</div>

			{/* Slide-in Menu Overlay & Content */}
			{/* Overlay */}
			<div
				className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300 backdrop-blur-sm ${isMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
				onClick={() => setIsMenuOpen(false)}
			/>

			{/* Menu Panel */}
			<div
				className={`fixed inset-y-0 left-0 w-72 bg-[#0a0a0e]/95 backdrop-blur-xl z-[70] transform transition-transform duration-300 ease-in-out border-r border-white/10 shadow-2xl flex flex-col ${isMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
			>
				{/* Close Button */}
				<div className="p-4 flex justify-end">
					<button
						onClick={() => setIsMenuOpen(false)}
						className="text-gray-400 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/10"
					>
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
							<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				{/* Content */}
				<div className="px-6 pb-8 flex flex-col flex-grow overflow-y-auto custom-scrollbar">
					{/* Top Content */}
					<div className="space-y-8">
						{/* Section 1: App Info */}
						<div className="space-y-3">
							<div className="flex items-center gap-3">
								<img src="/logo.png" alt="iroAwase" className="w-8 h-8 object-contain" />
								<h2 className="text-2xl font-bold text-white leading-none tracking-tight" style={{ fontFamily: 'var(--font-comfortaa)' }}>iroAwase</h2>
							</div>
							<p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">v1.2</p>
							<p className="text-sm text-gray-400 leading-relaxed font-medium">{(t as any).menu_app_desc}</p>
						</div>

						<div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

						{/* Section 2: Related Tools */}
						<div className="space-y-4">
							<h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{(t as any).menu_related}</h3>
							<a
								href="https://karuku-suru.vercel.app/"
								target="_blank"
								rel="noopener noreferrer"
								className="group block bg-white/[0.03] rounded-2xl p-4 hover:bg-white/[0.08] transition-all border border-white/5 hover:border-indigo-500/30 shadow-lg"
							>
								<div className="flex items-center gap-4 mb-3">
									<div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center p-2 group-hover:scale-110 transition-transform">
										<img src="/karukusuru-logo.png" alt="karukuSuru" className="w-full h-full object-contain" />
									</div>
									<div>
										<p className="text-white font-bold group-hover:text-indigo-400 transition-colors">karukuSuru</p>
										<p className="text-[10px] text-gray-500 font-medium">Image Resizer & Optimizer</p>
									</div>
								</div>
								<p className="text-xs text-gray-400 mb-4 leading-relaxed line-clamp-2">{(t as any).menu_karukusuru_desc}</p>
								<div className="flex items-center justify-end">
									<span className="text-[11px] text-indigo-400 group-hover:text-indigo-300 flex items-center font-bold gap-1 transition-colors">
										{(t as any).menu_open}
										<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
											<path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
										</svg>
									</span>
								</div>
							</a>
						</div>
					</div>

					{/* Bottom Content (About) */}
					<div className="mt-auto pt-8">
						<div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-8" />

						{/* Section 3: About */}
						<div className="space-y-6">
							<h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.2em]">{(t as any).menu_about}</h3>
							<div className="space-y-2.5">
								<p className="text-xs text-gray-400 font-medium tracking-tight">{(t as any).menu_privacy}</p>
								<p className="text-xs text-gray-400 font-medium tracking-tight">{(t as any).menu_client_side}</p>
								<p className="pt-4 text-[10px] text-gray-600 font-mono tracking-tight uppercase">© 2025 CodeAtelier Yu</p>
							</div>

							<a
								href="https://x.com/CodeAtelierYu"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-3 text-gray-500 hover:text-[#1d9bf0] transition-all p-2 -ml-2 rounded-xl hover:bg-[#1d9bf0]/5 group"
							>
								<svg viewBox="0 0 24 24" className="w-5 h-5 fill-current transition-transform group-hover:scale-110" aria-hidden="true">
									<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path>
								</svg>
								<span className="text-xs font-bold uppercase tracking-wider">Follow for updates</span>
							</a>
						</div>
					</div>
				</div>
			</div>

			{/* Language Switcher */}
			<div className="absolute top-0 right-4 md:right-0 z-50">
				<div className="flex bg-white/5 backdrop-blur-md rounded-xl p-1 text-xs font-bold border border-white/10 shadow-2xl">
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
						className="bg-white/5 backdrop-blur-sm rounded-3xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-300 overflow-hidden group cursor-pointer border border-white/10 transition-all hover:bg-white/10 hover:border-white/20"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'reference')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={(e) => handleFileSelect(e, 'reference')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{reference ? (
							<div className="flex flex-col items-center justify-center w-full h-full p-6 gap-3">
								<img src={reference.url} alt="Reference" className="max-w-full max-h-[85%] object-contain shadow-2xl rounded-lg z-10" />
								<p className="text-xs text-white font-medium bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md group-hover:bg-white/20 transition-colors z-10 border border-white/10">
									{t.changeRef}
								</p>
							</div>
						) : (
							<div className="flex flex-col items-center gap-4 pointer-events-none group-hover:scale-105 transition-transform duration-300">
								<div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/30 group-hover:text-white/60 group-hover:border-white/20 transition-colors">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
										<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
								</div>
								<p className="text-sm font-medium text-gray-400 group-hover:text-white text-center leading-relaxed whitespace-pre-wrap">
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
						className="bg-white/5 backdrop-blur-sm rounded-3xl aspect-[3/2] relative flex flex-col items-center justify-center text-gray-300 overflow-hidden group cursor-pointer border border-white/10 transition-all hover:bg-white/10 hover:border-white/20"
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => handleFileSelect(e, 'target')}
					>
						<input type="file" accept={ACCEPTED_EXTENSIONS.join(',')} multiple onChange={(e) => handleFileSelect(e, 'target')} className="absolute inset-0 opacity-0 cursor-pointer z-20" />

						{targets.length > 0 ? (
							<div className="p-4 w-full h-full z-10 overflow-y-auto custom-scrollbar">
								<div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
									{targets.map((tgt, i) => (
										<div key={i} className="relative aspect-square bg-white/5 rounded-xl overflow-hidden border border-white/10 shadow-lg group/item">
											<img src={tgt.url} className="w-full h-full object-cover transition-transform group-hover/item:scale-110" alt={`target-${i}`} />
											<div className="absolute inset-0 bg-black/40 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
												<span className="text-[10px] text-white font-bold">#{i + 1}</span>
											</div>
										</div>
									))}
									<div className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-xl text-[10px] text-gray-500 font-medium bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all">
										{t.add}
									</div>
								</div>
							</div>
						) : (
							<div className="flex flex-col items-center gap-4 pointer-events-none group-hover:scale-105 transition-transform duration-300">
								<div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/30 group-hover:text-white/60 group-hover:border-white/20 transition-colors">
									<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
										<path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
									</svg>
								</div>
								<p className="text-sm font-medium text-gray-400 group-hover:text-white text-center leading-relaxed whitespace-pre-wrap">
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
					className="px-32 py-6 rounded-2xl font-bold text-2xl text-white shadow-2xl bg-indigo-600 hover:bg-indigo-500 transition-all transform hover:-translate-y-1 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none whitespace-nowrap border border-white/10"
				>
					{processStatus.isProcessing ? (
						<span className="flex items-center gap-3">
							<svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							{t.btnProcessing}
						</span>
					) : t.btnAdjust}
				</button>

				{/* Progress */}
				{(processStatus.isProcessing || (processStatus.progress > 0 && processStatus.progress < 100)) && (
					<div className="w-full max-w-[500px] space-y-3 pt-2 px-6 py-4 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl">
						<div className="flex justify-between text-xs font-bold text-gray-300 uppercase tracking-widest">
							<span>{processStatus.message}</span>
							<span className="text-indigo-400">{processStatus.progress}%</span>
						</div>
						<div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
							<div
								className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out shadow-[0_0_15px_rgba(99,102,241,0.5)]"
								style={{ width: `${processStatus.progress}%` }}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Result Area */}
			{results.length > 0 && (
				<div ref={resultsRef} className="animate-slide-up space-y-8 pt-8 border-t border-gray-800 scroll-mt-8 text-center sm:text-left">
					<div className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 md:px-8">
						<h3 className="text-3xl font-bold text-gray-200 tracking-tight">{t.resultsTitle}</h3>
					</div>

					<div className="space-y-12 pb-8">
						{results.map((res, i) => (
							<div key={i} className="space-y-6 bg-white/5 backdrop-blur-md py-8 rounded-3xl border border-white/10 md:mx-4 shadow-2xl transition-all hover:bg-white/[0.07] hover:border-white/20">
								<div className="flex justify-between items-center px-8">
									<h4 className="text-gray-300 font-bold flex items-center gap-2">
										<span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/50 border border-white/10">{i + 1}</span>
										{res.name}
									</h4>
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
								<div className="max-w-[800px] mx-auto w-full px-4 md:px-8">
									<div className="bg-black/20 rounded-2xl p-4 md:p-6 border border-white/5">
										<div className="flex justify-between items-center mb-4">
											<span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest leading-none">Adjustment Intensity</span>
										</div>
										<div className="flex flex-col gap-3">
											<div className="flex justify-between text-[10px] text-gray-500 font-bold uppercase tracking-tighter px-1">
												<span>{t.labelOriginal}</span>
												<span className="text-indigo-400/80">{t.labelStandard}</span>
												<span>{t.labelIntense}</span>
											</div>
											<div className="flex items-center gap-4">
												<input
													type="range"
													min="0"
													max="100"
													value={res.intensity}
													onChange={(e) => handleIntensityChange(i, parseInt(e.target.value))}
													className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
												/>
												<span className="w-10 text-right font-mono text-indigo-400 text-sm font-bold">{res.intensity}</span>
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
					<div className="h-40" />
				</div>
			)}

			{/* Fixed Download Bar - Outside all results space to avoid parent transforms */}
			{results.length > 0 && (
				<div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-[550px] animate-slide-up px-4 sm:px-0">
					<div className="bg-[#1e1e24]/90 backdrop-blur-xl border border-white/15 rounded-2xl p-3 sm:p-4 shadow-[0_20px_50px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 sm:gap-4 overflow-hidden">
						<div className="flex flex-col pl-2 hidden min-[400px]:flex">
							<span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Status</span>
							<span className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
								<span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
								{results.length} / {targets.length} {t.statusDone}
							</span>
						</div>

						<button
							onClick={handleDownloadZip}
							disabled={processStatus.isProcessing}
							className="flex-1 px-4 sm:px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/30 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
								<path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
							</svg>
							{t.btnDownloadZip.split(" (")[0].replace(" 📦", "")}
						</button>

						<button
							onClick={handleResetClick}
							className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all shadow-lg active:scale-95 shrink-0"
							title={t.btnReset}
						>
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
								<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
							</svg>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
