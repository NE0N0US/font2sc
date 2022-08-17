const
insetsStroked = (element, strokeWidth, characters, padding, lefts, rights) => {
	element.style.display = 'block';
	const insets = characters.map((character, characterIndex) => {
		element.innerHTML = character;
		const bBox = element.getBBox();
		return {
			left: Math.floor(bBox.x + (padding ? 0 : bBox.width * lefts[characterIndex]) - strokeWidth),
			top: Math.floor(bBox.y - strokeWidth),
			right: Math.ceil(bBox.x + bBox.width - (padding ? 0 : bBox.width * rights[characterIndex] - 2) + strokeWidth) + 1,
			bottom: Math.max(Math.ceil(bBox.y + bBox.height + strokeWidth), 1) + 1
		};
	});
	element.style.display = 'none';
	return insets;
},
sum = (array, start, end) => array.slice(start, end + 1).reduce((partialSum, value) => partialSum + value, 0),
linesStroked = (element, strokeWidth, characters, padding, lefts, rights, width) => {
	const
	insets = insetsStroked(element, strokeWidth, characters, padding, lefts, rights),
	widths = insets.map(inset => inset.right - inset.left),
	ends = insets.reduce((lines, inset, index) => {
		if(sum(widths, lines[lines.length - 2] + 1, lines[lines.length - 1] + 1) > width - 1)
			lines.push(index);
		else
			lines[lines.length - 1] += 1;
		return lines;
	}, [-1, -1])
	.filter(end => end >= 0),
	starts = [0, ...ends.map(end => end + 1)];
	return ends.map((end, endIndex) => {
		const
		lineCharacters = characters.slice(starts[endIndex], end + 1),
		lineInsets = insets.slice(starts[endIndex], end + 1);
		return {
			text: lineCharacters.map((character, characterIndex) => ({
				character: character,
				inset: lineInsets[characterIndex]
			})),
			top: Math.min(...lineInsets.map(lineInset => lineInset.top)),
			bottom: Math.max(...lineInsets.map(lineInset => lineInset.bottom))
		};
	});
},
layOutVerbose = (container, element, content, strokeWidth, characters, padding, lefts, rights, width, fontCapsShift) => {
	const
	lines = linesStroked(element, strokeWidth, characters, padding, lefts, rights, width),
	minLeft = Math.min(...lines.map(line => line.text[0].inset.left)),
	heights = lines.map(line => line.bottom - line.top),
	height = sum(heights, 0, lines.length - 1) + 1,
	minTop = Math.min(...lines.map(line => line.top)),
	maxBottom = Math.max(...lines.map(line => line.bottom)),
	maxHeight = maxBottom - minTop,
	description = [
		characters.length,
		lines.map((line, lineIndex) => {
			const
			widths = line.text.map(symbol => symbol.inset.right - symbol.inset.left),
			y = sum(heights, 0, lineIndex - 1) - line.top,
			lineDescription = line.text.map((symbol, symbolIndex) => {
				const x = sum(widths, 0, symbolIndex - 1);
				content.insertAdjacentHTML('beforeend', `<text x="${minLeft + x - symbol.inset.left + (padding ? 0 : 1)}" y="${y}" class="font2sc">${symbol.character}</text>`);
				return [
					symbol.character,
					...[
						x / width,
						(y + line.top) / height,
						(x + symbol.inset.right - symbol.inset.left) / width,
						(y + line.top + heights[lineIndex]) / height
					].map(value => value.toFixed(6)),
					'0',
					line.top - minTop,
					symbol.inset.right - symbol.inset.left
				].join('\t');
			}).join('\n');
			content.insertAdjacentHTML('beforeend', `<rect x="${minLeft}" y="${y + 1.5}" width="${width}" height="1" class="font2sc"/>`);
			return lineDescription;
		}).join('\n'),
		maxHeight,
		`0\t${Math.floor(fontCapsShift * maxHeight)}`,
		'0.632',
		'_'
	].join('\n');
	container.setAttribute('viewBox', [minLeft, 0, width, height].join(','));
	container.setAttribute('width', width);
	container.setAttribute('height', height);
	return description;
},
readAsDataUrl = blob => new Promise((resolve, reject) => {
	const fileReader = new FileReader();
	fileReader.onload = () => resolve(fileReader.result);
	fileReader.onerror = reject;
	fileReader.readAsDataURL(blob);
}),
addToArchive = (archive, filename, data) => archive.file(filename, data, {
	binary: true,
	compression: 'STORE'
}),
loadImg = src => new Promise((resolve, reject) => {
	const img = document.createElement('img');
	img.onload = () => resolve(img);
	img.onerror = reject;
	img.src = src;
}),
rasterizeAlpha = async(container, scale, transform) => {
	const
	width = +container.getAttribute('width'),
	height = +container.getAttribute('height'),
	canvas = document.createElement('canvas');
	canvas.width = width * scale;
	canvas.height = scale;
	const
	context = canvas.getContext('2d'),
	svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(container)], {type: 'image/svg+xml'})),
	image = await loadImg(svgUrl);
	let data = new Uint8ClampedArray(width * height);
	for(let y = 0; y < height; y++){
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(image, 0, y, width, 1, 0, 0, canvas.width, canvas.height);
		for(let x = 0; x < width; x++)
			data[y * width + x] = context.getImageData(x * scale, 0, scale, canvas.height).data.filter((pixelComponent, rgbaIndex) => rgbaIndex % 4 === 3).reduce((mean, value, index) => (mean * index + value) / (index + 1), 0);
		await indicateProgress((y + 1) / height / 3, transform);
	};
	for(let y = 0; y < height; y++){
		let previous = data[(y + 1) * width - 1];
		for(let x = 0; x < width; x++){
			const
			index = y * width + x,
			current = (previous + data[index]) / 2;
			previous = data[index];
			data[index] = current;
		};
		await indicateProgress((1 + (y + 1) / height) / 3, transform);
	};
	for(let x = 0; x < width; x++){
		let previous = data[(height - 1) * width + x];
		for(let y = 0; y < width; y++){
			const
			index = y * width + x,
			current = (previous + data[index]) / 2;
			previous = data[index];
			data[index] = current;
		};
		await indicateProgress((2 + (x + 1) / width) / 3, transform);
	};
	URL.revokeObjectURL(svgUrl);
	return data;
},
compose = (grayscale, alpha) => new Uint8ClampedArray(4 * alpha.length).map((pixelComponent, rgbaIndex) => (rgbaIndex % 4 === 3 ? alpha : grayscale)[(rgbaIndex - rgbaIndex % 4) / 4]),
toBlob = canvas => new Promise(resolve => canvas.toBlob(blob => resolve(blob))),
font2sc = async (fonts, padding, width, scale, smallCaps) => {
	const
	waitFontFamily = document.getElementById('wait').style.fontFamily,
	zip = new JSZip();
	for(const font of fonts){
		await indicateProgress(0, progress => progress);
		try{
			const
			fontData = await font.arrayBuffer(),
			fontBase64 = (await readAsDataUrl(font)).replace(/.+?base64,/, `data:${font.type};base64,`),
			parsedFontData = opentype.parse(fontData),
			fontTop = parsedFontData.tables.head.yMax,
			fontCap = parsedFontData.tables.os2.sCapHeight,
			fontBottom = parsedFontData.tables.head.yMin,
			fontCapsShift = fontCap === undefined ? 0 : (fontCap - fontTop + (fontTop - fontCap - fontBottom) / 2) / (fontTop - fontBottom),
			fontGlyphs = Object.values(parsedFontData.glyphs.glyphs).map(fontGlyph => fontGlyph.unicodes.map(unicode => ({...fontGlyph, unicode: unicode}))).flat().filter(fontGlyph => (Number(fontGlyph.unicode) === fontGlyph.unicode) && (fontGlyph.unicode >= 0x20)).sort((a, b) => a.unicode - b.unicode),
			fontCharacters = fontGlyphs.map(fontGlyph => String.fromCharCode(fontGlyph.unicode)),
			fontLefts = fontGlyphs.map(fontGlyph => (fontGlyph.xMin === undefined || fontGlyph.advanceWidth === 0) ? 0 : (fontGlyph.xMin <= 0 ? 0 : fontGlyph.xMin) / (Math.max(fontGlyph.xMax, fontGlyph.advanceWidth) - Math.min(fontGlyph.xMin, 0))),
			fontRights = fontGlyphs.map(fontGlyph => (fontGlyph.xMax === undefined || fontGlyph.advanceWidth === 0) ? 0 : (fontGlyph.xMax >= fontGlyph.advanceWidth ? 0 : fontGlyph.advanceWidth - fontGlyph.xMax) / (Math.max(fontGlyph.xMax, fontGlyph.advanceWidth) - Math.min(fontGlyph.xMin, 0))),
			folder = zip.folder(parsedFontData.names.fullName.en),
			fontFace = new FontFace(parsedFontData.names.fontFamily.en, fontData, {weight: 'normal', style: 'normal'}),
			fontSizes = [12, '12u', 18, '18u', 24, 32],
			loadEstimates = fontSizes.map(fontSize => Math.pow(parseInt(fontSize), 2)),
			loadEstimatesSum = sum(loadEstimates, 0, loadEstimates.length - 1);
			document.fonts.add(fontFace);
			document.getElementById('wait').style.fontFamily = parsedFontData.names.fontFamily.en;
			fit(document.querySelector('#wait>svg'), document.getElementById('wait'));
			await document.fonts.ready;
			for(let c = 0; c < fontSizes.length; c++){
				const
				fontSize = fontSizes[c],
				fontSizeNum = parseInt(fontSize),
				strokeWidth = fontSizeNum / 32,
				container = new DOMParser().parseFromString(`
					<svg xmlns="http://www.w3.org/2000/svg" text-rendering="geometricPrecision" shape-rendering="geometricPrecision" style="position: absolute; inset: 0; width: 0; height: 0">
					<style>
						text.font2sc{
							white-space: pre;
							fill: white;
							paint-order: stroke;
							stroke-linecap: round;
							stroke-linejoin: round;
							stroke: transparent;
							stroke-width: ${strokeWidth * 2};
							font-family: '${parsedFontData.names.fontFamily.en}';
							font-variant-caps: ${smallCaps ? 'small-caps' : 'normal'};
							font-size: ${fontSizeNum / 0.632 * parsedFontData.unitsPerEm / fontTop}px;
						}
						rect.font2sc{
							fill: ${fontSizeNum === fontSize ? 'transparent' : 'white'};
							stroke-width: 0;
						}
						@font-face{
							font-family: '${parsedFontData.names.fontFamily.en}';
							font-weight: normal;
							font-style: normal;
							src: url("${fontBase64}");
						}
					</style>
					<text x="0" y="0" class="font2sc"></text>
					<g></g>
					</svg>
				`, 'image/svg+xml').documentElement;
				document.body.appendChild(container);
				const
				element = container.querySelector('text'),
				content = container.querySelector('g');
				addToArchive(folder, `Pericles${fontSize}.lst`, new Blob([layOutVerbose(container, element, content, strokeWidth, fontCharacters, padding, fontLefts, fontRights, width, fontCapsShift)], {type: 'text/plain'}));
				const grayscale = await rasterizeAlpha(container, scale, progress => ((sum(loadEstimates, 0, c - 1) + progress / 2 * loadEstimates[c]) / loadEstimatesSum));
				for(const child of content.children)
					child.style.stroke = 'white';
				const
				alpha = await rasterizeAlpha(container, scale, progress => ((sum(loadEstimates, 0, c - 1) + (1 + progress) / 2 * loadEstimates[c]) / loadEstimatesSum)),
				canvas = document.createElement('canvas');
				canvas.width = container.getAttribute('width');
				canvas.height = container.getAttribute('height');
				canvas.getContext('2d').putImageData(new ImageData(compose(grayscale, alpha), canvas.width), 0, 0);
				addToArchive(folder, `Pericles${fontSize}.png`, await toBlob(canvas));
				document.body.removeChild(container);
			};
			document.fonts.delete(fontFace);
		}
		catch(error){
			alert(`${error.name}: ${error.message}. Skipping ${font.name}`);
		};
	};
	document.getElementById('wait').style.fontFamily = waitFontFamily;
	const
	download = await zip.generateAsync({type: 'blob'}),
	a = document.createElement('a');
	a.href = URL.createObjectURL(download);
	a.download = `font2sc-${new Date().toISOString().replaceAll(':', '-')}-${padding ? 'sidebearings' : 'none'}-${width}x${scale}-${smallCaps ? 'smallcaps' : 'normal'}.zip`;
	a.click();
	URL.revokeObjectURL(a.href);
},
fit = (content, container) => {
	const shown = container.classList.contains('shown');
	if(!shown)
		container.classList.add('shown');
	content.setAttribute('viewBox', ['x', 'y', 'width', 'height'].map(key => content.getBBox()[key]).join(','));
	if(!shown)
		container.classList.remove('shown');
},
showDrop = (event, overlay) => {
	if(event.relatedTarget === null)
		overlay.classList.add('shown');
},
hideDrop = (event, overlay) => {
	if((event.relatedTarget === null) || (event.target === null))
		overlay.classList.remove('shown');
},
upload = files => {
	fonts = files;
	document.getElementById('fonts').innerText = files.length === 0 ? 'Upload' : files.map(file => file.name).join(', ');
},
indicateProgress = async(value, transform) => {
	document.getElementById('progress').style.width = `${transform(value) * 100}%`;
	if(document.visibilityState === 'visible')
		await new Promise(resolve => setTimeout(resolve));
},
closeTab = () => (history.length === 1 ? close : () => history.back())(),
clickElement = id => document.getElementById(id).click(),
changePadding = value => {
	document.getElementById('smallCaps').classList.toggle('shown');
	padding = value === 'true';
},
changeWidth = value => width = +value,
changeScale = value => scale = +value,
convert = async smallCaps => {
	if(fonts.length === 0)
		alert('No fonts selected');
	else{
		document.getElementById('wait').classList.add('shown');
		await font2sc(fonts, padding, width, scale, smallCaps);
		document.getElementById('wait').classList.remove('shown');
	};
};
fonts = [];
padding = true;
width = 128;
scale = 1;
window.ondragenter = event => showDrop(event, document.getElementById('drop'));
window.ondragleave = event => hideDrop(event, document.getElementById('drop'));