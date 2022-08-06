const
insetStroked = (strokeWidth, svgGraphicsElement) => {
	const bBox = svgGraphicsElement.getBBox();
	return {
		left: Math.floor(bBox.x - strokeWidth),
		top: Math.floor(bBox.y - strokeWidth),
		right: Math.ceil(bBox.x + bBox.width + strokeWidth),
		bottom: Math.ceil(bBox.y + bBox.height + strokeWidth)
	};
},
insetsStroked = (element, strokeWidth, characters) => {
	element.style.display = 'block';
	const insets = characters.map(character => {
		element.innerHTML = character;
		return insetStroked(strokeWidth, element);
	});
	element.style.display = 'none';
	return insets;
},
sum = (array, start, end) => array.slice(start, end + 1).reduce((partialSum, value) => partialSum + value, 0),
linesStroked = (element, strokeWidth, characters, width) => {
	const
	insets = insetsStroked(element, strokeWidth, characters),
	widths = insets.map(inset => inset.right - inset.left),
	ends = insets.reduce((lines, inset, index) => {
		if(sum(widths, lines[lines.length - 2] + 1, lines[lines.length - 1] + 1) > width)
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
layOutVerbose = (container, element, content, strokeWidth, characters, width) => {
	const
	lines = linesStroked(element, strokeWidth, characters, width),
	minLeft = Math.min(...lines.map(line => line.text[0].inset.left)),
	heights = lines.map(line => line.bottom - line.top),
	height = sum(heights, 0, lines.length - 1),
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
				content.insertAdjacentHTML('beforeend', `<text x="${minLeft + x - symbol.inset.left}" y="${y}" class="font2sc">${symbol.character}</text>`);
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
			content.insertAdjacentHTML('beforeend', `<rect x="${minLeft}" y="${y + 1}" width="${width}" height="1" class="font2sc"/>`);
			return lineDescription;
		}).join('\n'),
		maxHeight,
		'0\t0',
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
rasterizeAlpha = async(container, scale) => {
	const
	canvas = document.createElement('canvas'),
	svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(container)], {type: 'image/svg+xml'}));
	canvas.width = scale * container.getAttribute('width');
	canvas.height = scale * container.getAttribute('height');
	const context = canvas.getContext("2d");
	context.drawImage(await loadImg(svgUrl), 0, 0, canvas.width, canvas.height);
	URL.revokeObjectURL(svgUrl);
	return context.getImageData(0, 0, canvas.width, canvas.height).data.filter((pixelComponent, rgbaIndex) => rgbaIndex % 4 === 3);
},
compose = (grayscale, alpha) => Uint8ClampedArray.from(Array(4 * alpha.length).fill().map((pixelComponent, rgbaIndex) => (rgbaIndex % 4 !== 3 ? grayscale : alpha)[(rgbaIndex - rgbaIndex % 4) / 4])),
toBlob = canvas => new Promise(resolve => canvas.toBlob(blob => resolve(blob))),
font2sc = async (fonts, width, scale, smallCaps) => {
	const zip = new JSZip();
	for(const font of fonts){
		try{
			const
			fontData = await font.arrayBuffer(),
			fontBase64 = (await readAsDataUrl(font)).replace(/.+?base64,/, `data:${font.type};base64,`),
			parsedFontData = opentype.parse(fontData),
			fontCharacters = Object.values(parsedFontData.glyphs.glyphs).map(fontGlyph => fontGlyph.unicode).filter(unicode => (Number(unicode) === unicode) && (unicode >= 0x20)).map(unicode => String.fromCharCode(unicode)),
			folder = zip.folder(parsedFontData.names.fontFamily.en),
			fontFace = new FontFace(parsedFontData.names.fontFamily.en, fontData);
			document.fonts.add(fontFace);
			await document.fonts.ready;
			for(const fontSize of [12, '12u', 18, '18u', 24, 32]){
				const
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
							font-size: ${fontSizeNum}pt;
						}
						rect.font2sc{
							fill: ${fontSizeNum !== fontSize ? 'white': 'transparent'};
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
				addToArchive(folder, `Pericles${fontSize}.lst`, new Blob([layOutVerbose(container, element, content, strokeWidth, fontCharacters, width)], {type: 'text/plain'}));
				const grayscale = await rasterizeAlpha(container, scale);
				for(const child of content.children)
					child.style.stroke = 'white';
				const
				alpha = await rasterizeAlpha(container, scale),
				canvas = document.createElement('canvas');
				canvas.width = scale * container.getAttribute('width');
				canvas.height = scale * container.getAttribute('height');
				canvas.getContext("2d").putImageData(new ImageData(compose(grayscale, alpha), canvas.width), 0, 0);
				addToArchive(folder, `Pericles${fontSize}.png`, await toBlob(canvas));
				document.body.removeChild(container);
			};
			document.fonts.delete(fontFace);
		}
		catch(error){
			alert(`${error.name}: ${error.message}. Skipping ${font.name}`);
		};
	};
	const
	download = await zip.generateAsync({type: 'blob'}),
	a = document.createElement('a');
	a.href = URL.createObjectURL(download);
	a.download = `font2sc-${new Date().toISOString().replaceAll(':', '-')}-${width}x${scale}.zip`;
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
closeTab = () => {
	if(history.length === 1)
		close();
	else
		history.back();
},
clickElement = id => document.getElementById(id).click(),
changeWidth = value => width = +value,
changeScale = value => scale = +value,
convert = async smallCaps => {
	if(fonts.length === 0)
		alert('No fonts selected');
	else{
		document.getElementById('wait').classList.add('shown');
		await font2sc(fonts, width, scale, smallCaps);
		document.getElementById('wait').classList.remove('shown');
	};
};
fonts = [];
width = 128;
scale = 1;
window.ondragenter = event => showDrop(event, document.getElementById('drop'));
window.ondragleave = event => hideDrop(event, document.getElementById('drop'));
