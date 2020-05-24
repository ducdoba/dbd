/*NOTE: some methods from native lib aren't made available - like enable/disable a particular symbology and getting settings, like active symbologies, etc.

Design Q: Keep startScanning(x,y,w,h) args interface, and result success callback user/default?

MAYBE .iniClear() -this was mainly used for mthreading(no such thing here)

1. get device/platform info
2. obtain current orientation from native js

5. focus() to div.click depending on how it works with mediaStream

6. how do/will flash/zoom references work?
7. proper resize and whatnot depending on device/platform (desk vs. phone)
MAYBE close button for iOS, and/or event handler for close/back for all platforms

Design Q: add DOMs before/after camera OK, and/or display none/invisible


API events:

-1- the Promise returned from getUserMedia, goes into .catch when:
	-camera is used by another app, with e: NavigatorUserMediaError {name: "TrackStartError", message: "", constraintName: ""}
	-camera use blocked, with e: NavigatorUserMediaError {name: "PermissionDeniedError", message: "", constraintName: ""}
	-no camera, with e: NavigatorUserMediaError {name: "DevicesNotFoundError", message: "", constraintName: ""}
	
-2- mediaStream.oninactive event is raised when you say 'pull out' the camera

*/


//1. dynamic DOM elements (preview, wrapper divs, overlay canvas, zoom/flash), that 1 const container

var mwb_debug_print = false;

var Dynamic_DOM_Elements = {
	
	previewFrame_Style: document.createElement('link'),
	previewFrame_Style_init: function () {
		this.previewFrame_Style.rel = "stylesheet";
		this.previewFrame_Style.type = "text/css";
		this.previewFrame_Style.href = "barcode-scanner-preview-style.css";
		
		document.head.appendChild(this.previewFrame_Style);
	},
	
	//create inner div container for the video element
	previewFrame: document.createElement('div'),
	previewFrame_init: function () {
		this.previewFrame.id = "root-div-inview";
		this.previewFrame.className = "barcode-scanner-wrap-inview";
	},
	
	proxyWrapPreview: document.createElement('div'), //might not be needed
	proxyWrapPreview_init: function () {
		this.proxyWrapPreview.className = "proxy-wrap-of-preview-inview";
		this.proxyWrapPreview.style.cssText = "width: 100%; height: 100%;";
	},
	
	preview: document.createElement('video'),
	preview_init: function (handler) {
		this.preview.id = "video-layer";
		this.preview.className = "barcode-scanner-preview-inview";
		/*this.preview.addEventListener('click', //function() {
			// focus(); //TO-DO //besides, won't MWOverlay that is, canvas be on top?
		//});
		handler
		);*/
	},
	
	//create canvas for Overlay
	overlay: document.createElement('canvas'),
	overlay_init: function () {
		this.overlay.id = "canvas-overlay";
		this.overlay.className = "shadow-overlay";
	},
	
	//create canvas for lines
	lineV: document.createElement('canvas'),
	lineV_init: function () {
		this.lineV.id = "canvas-line-v";
		this.lineV.className = "blinking-line";
	},
	
	lineH: document.createElement('canvas'),
	lineH_init: function () {
		this.lineH.id = "canvas-line-h";
		this.lineH.className = "blinking-line";
	},
	
	lines: { v: this.lineV, h: this.lineH }, //at this point, because its async op, lineV and lineH aren't set yet, and undefined is what will be copied
	
	lines_Style_init: function (overlayProperties) {
		//set lines style
		this.lineV.style.backgroundColor = this.lineH.style.backgroundColor = overlayProperties.lineColor;
		this.lineV.style.animation = this.lineH.style.animation = "fadeColor " + overlayProperties.blinkingRate + "ms infinite";
	},
	
	//maybe have a function to 'import' and 'export' all needed ref
	
	//create image buttons for flash
	flash: document.createElement('div'),
	flash_init: function (buttons, handler) {
		this.flash.id = "flash-button";
		
		var divImage = document.createElement('img');
		divImage.id = "flash-image";
		divImage.src = buttons.flash_icons[0];
		
		//if not enabled hide the button as if it doesn't exist at all
		if (buttons.hideFlash) this.flash.style.display = "none";
		
		this.flash.appendChild(divImage);
		
		this.flash.addEventListener('click', handler, false);
		
		// **style for position needs to be linked to canvasOverlay's position
		this.flash.style.position = "fixed"; //absolute anchors it to page, fixed to screen
		this.flash.style.cssFloat = "none";
	},
	
	//and zoom
	zoom: document.createElement('div'),
	zoom_init: function (buttons, handler) {
		this.zoom.id = "zoom-button";
		
		var divImage = document.createElement('img');
		divImage.id = "zoom-image";
		divImage.src = buttons.zoom_icons[0];
		
		// if not enabled hide the button as if it doesn't exist at all
		if (buttons.hideZoom) this.zoom.style.display = "none";
		
		this.zoom.appendChild(divImage);
		
		this.zoom.addEventListener('click', handler, false);
		
		// **style for position needs to be linked to canvasOverlay's position
		this.zoom.style.position = "fixed"; //absolute anchors it to page, fixed to screen
		this.zoom.style.cssFloat = "none";
	},
	
	disappearElements: function (onStart)
	{
		//until video is loaded
		this.overlay.style.display = "none"; //or style.visibility = "hidden";
		this.lineV.style.display = "none";
		this.lineH.style.display = "none";
		this.flash.style.display = "none";
		this.zoom.style.display = "none";
		
		//previewFrame handling for height 0 until 8ms on 2+ runs
		//this.previewFrame.style.display = "none";
		//if (typeof onStart == 'boolean' && onStart) setTimeout(function(){ Dynamic_DOM_Elements.previewFrame.style.display = "initial"; }, 32); //8 min | higher time seems to fix the height 0 bug and
		//the black preview 'flashing' before starting on 2+ runs, at least on Note5
		//LG is also ok, only lags when anchor is used, but still ok
		
		//lets try with hidden
		this.previewFrame.style.visibility = "hidden";
	},
	
	revealElements: function ()
	{
		//when video stream data is loaded AND preview-overlay calcs are done
		this.overlay.style.display = "initial"; //or style.visibility = "visible";
		this.lineV.style.display = "initial";
		this.lineH.style.display = "initial";
		this.flash.style.display = (JavaScript_mediaDevices_API.flash.supported) ? ((MW_properties.global.fullscreenButtons.hideFlash) ? "none" : "initial") : "none"; //HERE
		this.zoom.style.display = (JavaScript_mediaDevices_API.zoom.supported) ? ((MW_properties.global.fullscreenButtons.hideZoom) ? "none" : "initial") : "none";
		
		//HTC flash/zoom buttons something not there on first run Bug fix
		setTimeout(function () {
			
			if (Dynamic_DOM_Elements.flash.style.display == "none" ||
				Dynamic_DOM_Elements.zoom.style.display == "none")
			{
				let zoom = Dynamic_DOM_Elements.zoom;
				let canvasOverlay = Dynamic_DOM_Elements.overlay;
				
				Dynamic_DOM_Elements.flash.style.display = (JavaScript_mediaDevices_API.flash.supported) ? ((MW_properties.global.fullscreenButtons.hideFlash) ? "none" : "initial") : "none";
				Dynamic_DOM_Elements.zoom.style.display = (JavaScript_mediaDevices_API.zoom.supported) ? ((MW_properties.global.fullscreenButtons.hideZoom) ? "none" : "initial") : "none";
				
				zoom.style.left = ((canvasOverlay.offsetWidth + canvasOverlay.offsetLeft) - zoom.offsetWidth) + "px"; //crucial
			}
			
		}, 0);
		
		//seems to work fine, no height 0 bug either
		this.previewFrame.style.visibility = "visible";
	},
	
	previewFrameParent: null,
	
	addPreview: function (container) {
		[this.proxyWrapPreview].forEach(function (element) {
			Dynamic_DOM_Elements.previewFrame.appendChild(element); //this. has a different scope here
		});
		//Insert preview frame and controls into container if provided or into page
		var container_exists = (container != undefined && container != null && typeof container === 'object' && container.tagName === 'DIV'); //NOTE: should container be limited to div ?
		this.previewFrameParent = (container_exists) ? container : document.body; //can also use default container HERE
		
		this.previewFrameParent.appendChild(this.previewFrame); if (mwb_debug_print) { console.log(this.previewFrame); console.log('neposredno po add:'); console.log(this.previewFrame.offsetHeight); }
		this.previewFrameParent.appendChild(this.overlay);
		this.previewFrameParent.appendChild(this.lineV);
		this.previewFrameParent.appendChild(this.lineH);
		this.previewFrameParent.appendChild(this.flash);
		this.previewFrameParent.appendChild(this.zoom);
	},
	
	destroyPreview: async function (this_root, track) {
		
		//stop decoder
		MWBScanner.DECODER_ACTIVE = false;
		
		//rm decoder timeout timer
		if (JavaScript_mediaDevices_API.scanner_timeout != null)
		{
			clearTimeout(JavaScript_mediaDevices_API.scanner_timeout);
			JavaScript_mediaDevices_API.scanner_timeout = null;
		}
		
		//to prevent 'black blinks before T's are finalized' for next run
		this.disappearElements();
		
		//set the remaining 'execution heavy' tasks after some time (128ms)
		//giving a chance for the DOM changes to complete
		//also take that into account for the alert after in the calling function
		//AND, now in a timer the ctx of this changes, so use direct access
		setTimeout(function () {
			Dynamic_DOM_Elements.preview.play(); //calling this before track.stop() will 'clear' the last frame
			//that might be left from pause on result success (both on HTC and Note5)
			
			//while that fixes that on devices like HTC, it also makes closing the scanner / removing the preview much slower on devices like Note5 - actually, doesn't matter, seems Note5 does the slow removal anyways
			
			//on Note5 Firefox, it seems last frame is always stored, regardless of .play() above or
			//using .pause for result success
			
			//one more thing to try: delete object, create new preview
			
			//if (mwb_debug_print) console.log('this_root');
			//if (mwb_debug_print) console.log(this_root);
			//if (mwb_debug_print) console.log(track);
			//SO apparently leaving those args makes them accessable
			//but specifying them as args to f() of setTimeout makes them undefined
			
			//video.pause(); //lets hope this is the this we need, yes, it works, but camera is still not stopped and keeps dissipating heat CONFIRMED! camera is on and running, its just the preview thats no longer updated
			//we're gonna have to stop this in its tracks
			track.stop(); //should hold the local ref, yep it does
			this_root.videoTrack = null;
			this_root.mediaStream = null;
			
			//clear last frame from videoElement
			//Dynamic_DOM_Elements.preview.src = ""; // empty source
			//Dynamic_DOM_Elements.preview.load();
			//^that however messes with the clearing of the timeout for some reason
			
			//this is probably going to change into destroy preview, no sense to keep it without a stream
			//also:
			if (this_root.torchState) //and would have to be done on any close/stop/destroy
			{
				this_root.torchState = false;
				Dynamic_DOM_Elements.flash.getElementsByTagName("img")[0].src = MW_properties.global.fullscreenButtons.flash_icons[0];
			}
			
			//remove event listeners:
			
			window.removeEventListener('resize', MW_methods.eventHandlers.resize, false);
			
			if (MW_methods.helpers._Screen_Orientation === 'undefined')
			{
				//
				window.removeEventListener('resize', MW_methods.helpers.orientationChangeHandler, false); //same handler - checks inside, for now
			}
			else
			{
				screen.orientation.removeEventListener('change', MW_methods.helpers.orientationChangeHandler);
			}
			
			//NOTE: flash and zoom use already_inited
			//so the EL is added once
			//no need to remove it
			
			Dynamic_DOM_Elements.preview.removeEventListener('loadeddata', this_root.videoStreamData_handler_wrapper); //crucial
			
			var this_root_2 = Dynamic_DOM_Elements;
				
			//remove added elements
			this_root_2.previewFrameParent.removeChild(this_root_2.zoom);
			this_root_2.previewFrameParent.removeChild(this_root_2.flash);
			this_root_2.previewFrameParent.removeChild(this_root_2.lineH);
			this_root_2.previewFrameParent.removeChild(this_root_2.lineV);
			this_root_2.previewFrameParent.removeChild(this_root_2.overlay);
			this_root_2.previewFrameParent.removeChild(this_root_2.previewFrame); //if (mwb_debug_print) { console.log(this.previewFrame); console.log('neposredno po remove:'); console.log(this.previewFrame.offsetHeight); }
			
		}, 128);
	},
	already_inited: false,
	main_createPreview: function (MW_properties, MW_methods) {
		//
		if (mwb_debug_print) console.log('createPreview ');
		
		if (!this.already_inited) {
			this.previewFrame_Style_init();
			this.previewFrame_init();			
		}
		
		var partialView = MW_properties.global.partialView;
		var viewfinderOnScreenView = MW_properties.runtime.viewfinderOnScreenView;
		
		MW_methods.anchorView_toOrientation(this.previewFrame, partialView.x, partialView.y, partialView.width, partialView.height, partialView.orientation, viewfinderOnScreenView.orientation);
		
		if (!this.already_inited) {
			this.proxyWrapPreview_init(); //might not be needed
			this.preview_init(function(){}); //needs a handler for focus on click OR nah? Maybe propagate thru canvas-overlay, or let continuous handle it?
			
			this.overlay_init();
			
			this.proxyWrapPreview.appendChild(this.preview); //might not be needed
			
			var mwBlinkingLines = MW_properties.global.blinkingLines;
			
			this.lineV_init();
			this.lineH_init();
			
			//obtain a ref
			mwBlinkingLines.v = this.lineV;
			mwBlinkingLines.h = this.lineH;
			
			var mwOverlayProperties = MW_properties.global.overlay;
			
			this.lines_Style_init(mwOverlayProperties); //might need to be exec more that once on start if different MW_overlay modes are used
			
			//scanningRects, union - here or? -taken care of in separate f() called before 'start scanning'
			
			var fullscreenButtons = MW_properties.global.fullscreenButtons;
			//^ add from ln 650 ..done.
			
			this.flash_init(fullscreenButtons, JavaScript_mediaDevices_API.flashToggler); //clickedFlash
			this.zoom_init(fullscreenButtons, JavaScript_mediaDevices_API.zoomLooper); //clickedZoom
			
			this.already_inited = true;
		}
		
		//MAYBE TO-DO:
		//close button might be needed for iOS
		//obtain window.navigator.platform (and/or other properties)
		//event-listener-handle-rs for (close), pause, resume - maybe w/ flag
		
		
		this.disappearElements(true); //same as no MWOverlay
		this.addPreview(MW_properties.global.container);
	}
};

//2. APIs: mesiaStream obj, zoom/flash capabilities settings, navigator.* , orientation/back events info, 
//	[anything else emscripten or nativeJS and/or Mozilla api HERE]
var JavaScript_mediaDevices_API = {
	//
	supported: false,
	browser_supported_constraints: null,
	runtime_settings_videoTrack: null,
	hardware_capabilities_ranges_videoTrack: null,
	
	_ImageCapture: (typeof ImageCapture === 'undefined') ? 'undefined' : ImageCapture,
	imageCapture: null,
	get_videoTrack_capabilities_timeout: 200,
	
	mediaStream: null,
	videoTrack: null,
	
	frameWidth: { min: 640, ideal: 640, max: 1280 },
	frameHeight: { min: 480, ideal: 480, max: 720 },
	
	frontCamera: false,
	
	constraints: {
		video: {
			width: null,//this.frameWidth,
			height: null,//this.frameHeight,
			frameRate: 30,
			facingMode: '',//(this.frontCamera) ? 'user' : 'environment',
			focusMode: 'continuous'
		}
	},
	
	constraints_init: function (width, height, useFrontCamera) {
		
		//this function can be called without args which will set the defaults
		if (typeof width === 'number') this.frameWidth.ideal = width;
		if (typeof height === 'number') this.frameHeight.ideal = height;
		if (typeof useFrontCamera === 'boolean') this.frontCamera = useFrontCamera;
		
		this.constraints.video.width = this.frameWidth;
		this.constraints.video.height = this.frameHeight;
		this.constraints.video.facingMode = (this.frontCamera) ? 'user' : 'environment';
		
		//maybe set to MW_properties here (and maybe keep caps object there)
		MW_properties.global.hardwareCameraResolution.width = this.frameWidth.ideal;
		MW_properties.global.hardwareCameraResolution.height = this.frameHeight.ideal;
		
		if (mwb_debug_print) {
			console.log('constraints:');
			console.log(this.constraints);
		}
	},
	
	flash: { supported: false, ready: false },
	zoom: { supported: false, ready: false },
	
	torchState: false,
	zoomLevels: [],
	zoomLevel: 0,
	
	imageCapture_options: {
		fillLightMode: (true/*this.torchState*/) ? 'flash' : 'off' //doesn't make a difference at this time | Tho is might with proper context? (and re-set)
		//focusMode: 'continuous'
	},
	
	flashToggler: function () {
		//because this is added as a handler to flash (DOM element) click
		//the context of this is different, i.e. the flash div
		let flash_state = JavaScript_mediaDevices_API.flash; //by ref
		let torchState = JavaScript_mediaDevices_API.torchState; //by value!
		let imageCapture = JavaScript_mediaDevices_API.imageCapture; //by ref
		let imageCapture_options = JavaScript_mediaDevices_API.imageCapture_options; //by ref
		let videoTrack = JavaScript_mediaDevices_API.videoTrack; //by ref
		
		if (mwb_debug_print && flash_state.supported) console.log('Torch is supported.');
		if (mwb_debug_print) console.log('the way it works is: lets find out');
		if (mwb_debug_print) console.log('the way it works is: ' + flash_state.supported + " and " + flash_state.ready);
		if (!flash_state.supported || !flash_state.ready) return;
		torchState = !torchState;
		if (mwb_debug_print) console.log('the way torch is: ' + torchState);
		
		try {
			//(re)setOptions is enough to turn the torch off	
			imageCapture.setOptions(imageCapture_options).then(() => {
				videoTrack.applyConstraints({
					advanced: [{torch: torchState}] //this set to true is a must to turn it on
					}); //but flash isn't turned off, only on LG
			});
		} catch (e) { if (mwb_debug_print) { console.log('imageCapture.setOptions is NOT supported'); console.log(e); }
		
			//instead try the one-way ON
			if (JavaScript_mediaDevices_API.browser_supported_constraints.torch) {
				videoTrack.applyConstraints({
					advanced: [{torch: torchState}]
				})
				.catch(e => console.log(e));
			}
		};
		
		Dynamic_DOM_Elements.flash.getElementsByTagName("img")[0].src = MW_properties.global.fullscreenButtons.flash_icons[Number(torchState)];
		JavaScript_mediaDevices_API.torchState = torchState;
	},
	
	zoomLooper: function ()
	{
		let zoom_state = JavaScript_mediaDevices_API.zoom; //by ref
		let zoomLevel = JavaScript_mediaDevices_API.zoomLevel; //by value!
		let zoomLevels = JavaScript_mediaDevices_API.zoomLevels; //by ref
		let videoTrack = JavaScript_mediaDevices_API.videoTrack; //by ref
		
		if (mwb_debug_print && zoom_state.supported) console.log('Zoom is supported.');
		
		if (!zoom_state.supported || !zoom_state.ready) return;
		zoomLevel++; zoomLevel %= 3;
		videoTrack.applyConstraints({ advanced: [{zoom: zoomLevels[zoomLevel]}] });
		
		if (mwb_debug_print) console.log('req zoomLevel: ' + zoomLevels[zoomLevel]);
		setTimeout(function(){
		if (mwb_debug_print) console.log('new zoomLevel: ' + videoTrack.getSettings().zoom);
		//Note5 and LG: [1, 2.45, 3.9], and then 1, 1, 1 on clicks but zooms fine, so it seems the report doesn't work, otherwise it's fine
		//HTC: [100, 245, 390], and then 100, 240, 390 might not report always correctly but thats just console/js lag (y), otherwise zooms fine
		}, 128);
		
		JavaScript_mediaDevices_API.zoomLevel = zoomLevel;
	},
	
	//simple error handling code; handleError() is called to handle promises which fail (.catch)
	handleError: function (reason) { 
		if (mwb_debug_print) console.log("Error " + reason.name + " in constraint " + reason.constraint + ": " + reason.message);
		
		//alert("Error " + reason.name + " in constraint " + reason.constraint + ": " + reason.message + ".\n\nMost likely this is due to camera related issues (no camera, no camera permission, camera is used on another page, etc.) or not using secure http connection.");
		//or no secure (https) connection
		if ((typeof MWBScanner.result_callback) == 'function')
		MWBScanner.result_callback(
			MW_methods.helpers.otherResult(
				reason.name + " in constraint " + reason.constraint + ": " + reason.message + ".\n\nMost likely this is due to camera related issues (no camera, no camera permission, camera is used on another page, etc.) or not using secure http connection.",	//code
				"Error"	//type
			)
		);
	},
	
	scanner_timeout: null,
	videoStreamData_handler_wrapper: null,
	
	init_values: function (video, videoStreamData_handler, inactiveStream_handler) {
		//
		this.supported = (typeof navigator.mediaDevices === 'object' && typeof navigator.mediaDevices.getUserMedia === 'function') ? true : false;
		
		if (!this.supported) return 'undefined';
		
		this.browser_supported_constraints = navigator.mediaDevices.getSupportedConstraints();
		
		if (mwb_debug_print) {
			
			console.log('capabilities / browser_supported_constraints:');
			console.log(this.browser_supported_constraints); //might be needed for conditional code in different browsers
			//what if no camera for example?
		}
		
		//set objects to nested objects in constraints
		this.constraints_init();
		
		//you need capabilities.zoom.constructor.name MediaSettingsRange and .torch | if not there if will be 'undefined'
		navigator.mediaDevices.getUserMedia(this.constraints)
		.then(function (stream) {
			
			let this_root = JavaScript_mediaDevices_API; //different scope of this
			
			this_root.mediaStream = stream;
			stream.oninactive = function () {				
				if (typeof inactiveStream_handler === 'function') inactiveStream_handler();
			};			
			
			const track = stream.getVideoTracks()[0];
			this_root.videoTrack = track;
						
			this_root.runtime_settings_videoTrack = track.getSettings();
			
			if (mwb_debug_print) {
				
				console.log('VT capabilities / runtime_settings_videoTrack:');
				console.log(this_root.runtime_settings_videoTrack); //might be needed for conditional code in different browsers
			}
			
			//actual available camera resolution might be different from requested ideal
			if ((typeof this_root.runtime_settings_videoTrack.width === 'undefined') || (typeof this_root.runtime_settings_videoTrack.height === 'undefined'))
			{
				throw "Properties width and height in VT capabilities aren't available!";
			}
			else
			{
				if (mwb_debug_print) console.log('HERE WH ' + this_root.runtime_settings_videoTrack.width + " " + this_root.runtime_settings_videoTrack.height);
				MW_properties.global.hardwareCameraResolution.width = this_root.runtime_settings_videoTrack.width;
				MW_properties.global.hardwareCameraResolution.height = this_root.runtime_settings_videoTrack.height;
			}
			
			//videoTrack capabilities depends on ImageCapture promise or timeout
			function capabilitiesDependentCode() {
				//if (mwb_debug_print) console.log(track);
				
				let capabilities_Indicator = null;
				let ranges_exist = false;
				
				try {
					const videoCapabilities = track.getCapabilities(); //Firefox doesn't support this method
					capabilities_Indicator = this_root.hardware_capabilities_ranges_videoTrack = videoCapabilities;
					ranges_exist = true;
					
				} catch (e) { if (mwb_debug_print) { console.log('track.getCapabilities not supported'); console.log(e); }
					
					//use this.browser_supported_constraints instead
					capabilities_Indicator = this_root.browser_supported_constraints;
					//Firefox doesn't support torch and zoom anyways
				}
				
				if (capabilities_Indicator.torch) this_root.flash.supported = true;
				
				else { if (mwb_debug_print) console.log('Torch is NOT supported.'); Dynamic_DOM_Elements.flash.style.display = "none"; }
				
				if (capabilities_Indicator.zoom) this_root.zoom.supported = true;
				else { if (mwb_debug_print) console.log('Zoom is NOT supported.'); Dynamic_DOM_Elements.zoom.style.display = "none"; return; } //display of flash and zoom is also handled by revealElements
				
				if (ranges_exist)
				{
					const min = capabilities_Indicator.zoom.min;
					const max = capabilities_Indicator.zoom.max;
					const step = capabilities_Indicator.zoom.step;
					
					//ranges might use different scale on different devices
					const number_of_digits = MW_methods.helpers.get_number_of_Digits(max);
					
					const _max = max - Math.pow(10, (number_of_digits - 2)); //this substracts 1% from max (needed because values are stepped and max might be ignored like out-of-range value)
					const mid = min + ((_max - min) / 2);
					
					this_root.zoomLevels = [min, mid, _max]; //would this work?
					if (mwb_debug_print) console.log('this_root.zoomLevels');
					if (mwb_debug_print) console.log(this_root.zoomLevels);
					if (mwb_debug_print) console.log('step: ' + step);
				}
				else
					this_root.zoomLevels = [100, 250-8, 400-16]; //extrapolated defaults
				
				this_root.zoomLevel = 0; //reset to 100% (no zoom)
				
				this_root.flash.ready = true; //test in ffox
				this_root.zoom.ready = true; //test in ffox
			}
			
			if (JavaScript_mediaDevices_API._ImageCapture === 'undefined') //this_root or leave it be
			{
				if (mwb_debug_print) console.log('there is no ImageCapture api');
				setTimeout(function () {
					capabilitiesDependentCode();
				}, this_root.get_videoTrack_capabilities_timeout);
			}
			else
			{
				//Create image capture object and get camera capabilities
				const imageCapture = new JavaScript_mediaDevices_API._ImageCapture(track);
				this_root.imageCapture = imageCapture;
				const photoCapabilities = imageCapture.getPhotoCapabilities().then(() => {
					//
					//check if camera has a torch
					capabilitiesDependentCode();
					
					if (!JavaScript_mediaDevices_API.flash.supported) return; //test return - also this. scope?
					else JavaScript_mediaDevices_API.flash.ready = true;
				});
			}
			
			if (typeof videoStreamData_handler === 'function')
			{
				this_root.videoStreamData_handler_wrapper = function () { videoStreamData_handler(this_root.mediaStream); };
				video.addEventListener('loadeddata', this_root.videoStreamData_handler_wrapper);
			}
			
			video.srcObject = this_root.mediaStream;			
			video.onloadedmetadata = function (e) { //also make the proxy wrapper visible
			if (mwb_debug_print) console.log('onloadedmetadata, calling play'); //seems this event come later than
				
				if (mwb_debug_print) console.log('video muted: ');
				if (mwb_debug_print) console.log(this.muted);
				this.muted = true;
				if (mwb_debug_print) console.log(this.muted);
				if (mwb_debug_print) console.log('calling play again 1');
				this.play()
				.catch(function(e) {
					//JavaScript_mediaDevices_API.handleError(e); //scope
					
					//setTimeout(function() {
					//	Dynamic_DOM_Elements.disappearElements(true); //arg doesn't matter now
					//	//but revealElements is probs called which negates these effects, so
					//}, 32);
					//video.setAttribute('webkit-playsinline', 'webkit-playsinline');
					video.setAttribute('playsinline', 'playsinline');
					if (mwb_debug_print) console.log('calling play again 2');
					
					//doesn't work for Safari
					//setTimeout(function() {
					//	if (mwb_debug_print) console.log('calling play again 3');
					//	video.play();
					//}, 50);
					
					MW_methods.helpers.safari_video_click_workaround(video);
				});
				
				JavaScript_mediaDevices_API.scanner_timeout = setTimeout(async function () {
					
					//if (!MWBScanner.DECODER_ACTIVE) return; //we'll see
					
					MWBScanner.DECODER_ACTIVE = false;
					JavaScript_mediaDevices_API.scanner_timeout = null;
					
					const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
					await wait(100); //waiting for last frame to finish decoding, tho it really shouldn't matter, and can be handled in another way
					MWBScanner.destroyPreview(); //not truly awaitable at this point
					//await wait(1000);
					//await wait(1000);
					
					//no need for above arbitrary max wait, but at least 128 for destroyPreview to finalize and another 100 of leeway
					await wait(128);
					await wait(100);
					alert('Scanner timeout');
				}, MWBScanner.decoder_timeout * 1000); //also link this with the setting minTimeout for frames and interval decoding //that should also be tied with fps from caps of this track | 10 *
			};
		})
		.catch(function(e) {
			JavaScript_mediaDevices_API.handleError(e); //scope
		});
	},
	
	//check if after putting the app in suspension still
	//works-uses the camera on mobile - android and rest
	//timeout would be nice
	
};

//3. SDK-related setting and features, partial view calculations, MWOverlay logic,
//	changes in DOM elements AND SDK-settings on C++ (scanRects), resize calculations,
//	event handlers, maybe back/close handling
const MW_assetsPath = "./assets/"; //added './' prefix for webpack
var MW_properties = {
	
	global: {
		partialView: //{ x: 0, y: 0, width: 100, height: 100, orientation: 0 }, //is orientation used here? -that only serves for that 'anchor' FEATURE
		{ x: 5, y: 5, width: 90, height: 54.73, orientation: 0 },
		//{ x: 25, y: 15, width: 50, height: 94.73/1.5, orientation: 0 },
		//{ x: 15, y: 15, width: 70/2, height: 94.73/2, orientation: 0 }
		//{ x: 20, y: 40, width: 64, height: 48, orientation: 0 }
		//it can be just ref, or specific props- but you'd still need to set them thru ref //1920 x 974 = 0.333 x 0.493 | 90, 54.73 | 33.33, 49.29
		blinkingLines: { v: null, h: null }, //MWOverlay DOM elements ref //final
		overlay: { 
			mode: 1, 
			pauseMode: 2, //1
			lineColor: "rgba(255, 0, 0, 1.0)", 
			locationColor: "rgba(0, 255, 0, 1.0)", 
			borderWidth: 2, 
			linesWidth: 1, 
			blinkingRate: 500, 
			locationShowTime: 200 + 300, //Safari actually shows the frame with more time - actually no, even with 500ms the glitch after show happens in Landscape
			locationAllPointsDraw: true, 
			imageSrc: MW_assetsPath + "overlay_mw.png" 
		}, //partial const
		fullscreenButtons: {
			flash: null,	   
			zoom: null,
			flash_icons: [MW_assetsPath + "flashbuttonoff.png", MW_assetsPath + "flashbuttonon.png"],
			zoom_icons:  [MW_assetsPath + "zoom.png"],
			hideFlash: false,
			hideZoom: false
		}, //partial const
		hideDuringUpdate: false, //(mostly) const
		hardwareCameraResolution: { width: 640, height: 480 }, //ini | const-once an actual resolution is picked //640x480 set to test only, change!
		//hardwareCameraResolution: { width: 640, height: 480 },
		numberOfSupporedCodes: 16, //const
		codeMasksArray: [], //const-final
		untouchedScanningRectsArray: [], //const-final
		//DOM_complete: false, //needed?
		//anyScannerStarted: false, //needed?
		video: null, //final
		container: null //final
	},
	
	runtime: {
		viewfinderOnScreenView: { orientation: 0, x: 0, y: 0, width: 0, height: 0 }, //only one that needs to be updated during orientation change
		untouchedScanningRectsUnion: { x: 0, y: 0, width: 100, height: 100 }, //get THIS / init from SDK
		is_portrait: false,
		operatingSystem: '', //final
		firstTimeUpdate: false,
		currentOrientation: 0, //landscape, portrait, landscapeFlipped
	},
	
	//note: initial_value for all settings are api configurable
	//also, runtime_value is set from initial_value and then gets changed
	//adapters should change gui states and also adapt gui values to expected method
	//values and vice-versa
	//requires type of control n data (int/[int]/bool/[bool], arr w/ len) value
	//n data type of method/arg, i.e. always [arg]
	
	gui2api_adapter: function () {
		//
		//all it does is convert one data type to another adequate one
		//can use the *.gui_*.cam*.*_value and their typeof to determine what 2 what
		//also can hold there gui_values and api_value(S), as in
		//copy the ones you use to init the gui s with generate
		
		//FIRST OF ALL CHANGE THE SCRIPTS TO POINT TO wa_dev		//done
		//same for bookmarks on phones 		THIS needs doing
		//in fact, do it now ..done
	},
	
	gui_accessible: {
		//
		cameraResolution: {
			values: [[640, 480], [1280, 720]],
			default_value: true, //gui toggle state i.e. 720
			initial_value: true,
			runtime_value: true
		},
		
		frontCamera: {
			values: [false, true],
			default_value: false,
			initial_value: false,
			runtime_value: false
		},
		
		multipleBarcodes: {
			values: [false, true],
			default_value: false,
			initial_value: false,
			runtime_value: false
		},
		
		activeCode: {
			values: null, //2^i
			default_value: 1, //Select barcode: on 0
			initial_value: 1,
			runtime_value: 1
		},
		
		activeCodes: {
			values: null, //binary OR union of 2^i
			default_value: [true, true, false, false, true, true, true, false, false, false, false, false, false, false, false, false],
			//115 //contains QR | DM | EAN/UPC | CODE128 | PDF
			initial_value: [true, true, false, false, true, true, true, false, false, false, false, false, false, false, false, false],
			runtime_value: [true, true, false, false, true, true, true, false, false, false, false, false, false, false, false, false]
		},
		
		effortLevel: {
			values: [1, 2], //not actually used (bool to number + 1 logic applied)
			default_value: true, //gui toggle => 2
			initial_value: 2, //needs adapter | 2-5 mapped to toggle on
			runtime_value: 2
			//gui2api
			//api2gui adapter
			//changes when/on:
		},
		
		partialView: { // !fullScreen
			values: [false, true],
			default_value: true,
			initial_value: true,
			runtime_value: true
		},
		
		partialView_XYWH: {
			values: null, //0-100 for each
			default_value: [5, 5, 90, 50],
			initial_value: [5, 5, 90, 50],
			runtime_value: [5, 5, 90, 50]
		},
		
		partialView_Anchor: {
			values: null, //0-3
			default_value: 1 //selects must have 0 reserved | select_AnchorView_handler does -= 1
			
			//NO NEED?
		},
		
		continuous: {
			values: [false, true],
			default_value: false,
			initial_value: false,
			runtime_value: false
		},
		
		parser: {
			values: [0x0, 0xFF], //again, not actually used (same values used tho)
			default_value: true, //gui toggle state i.e. 0xFF
			initial_value: true,
			runtime_value: true
		},
		
		timeout: {
			values: null, //10-60
			default_value: [30],
			initial_value: [30],
			runtime_value: [30]
		},
		
		dps: {
			values: null, //1-30 (fps max)
			default_value: [2], //20
			initial_value: [2],
			runtime_value: [2]
		},		
		
		pause: {
			values: [false, true],
			default_value: false,
			initial_value: false,
			runtime_value: false
		}		
	}
};

var MW_methods = {
	
	/**
	 * Processes preview behaviour.
	 * FEATURE: can transform based on anchor_to
	 * Generic method.
	 */
	anchorView_toOrientation: function (view, x1, y1, w1, h1, anchor_to, current_orientation) {

		if (anchor_to < 0 || anchor_to > 3 || current_orientation < 0 || current_orientation > 2) return;

		if (anchor_to == 0) //anchor_free: percentages are applied "as is" | behaviour: preview transforms dynamically for different orientations
		{
			view.style.cssText = "left: " + x1 + "%; top: " + y1 + "%; width: " + w1 + "%; height: " + h1 + "%;";
		}
		else //anchor_to_orientation: percentages are applied wrt. orientation | behaviour: preview stays fixed/immutable wrt. orientation
		{
			//[anchor_to] x [current_orientation]
			var anchoringProperties = [
				//landscape                                 portrait                                landscape flipped
				[{ x: x1, y: y1, width: w1, height: h1 }, { x: (100 - y1 - h1), y: x1, width: h1, height: w1 }, { x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }], // landscape
				[{ x: y1, y: (100 - x1 - w1), width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }, { x: (100 - y1 - h1), y: (100 - x1 - w1), width: h1, height: w1 }], // portrait
				[{ x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }, { x: y1, y: (100 - x1 - w1), width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }]  // landscape flipped
			];
			anchor_to--;
			view.style.cssText =	"left: " + anchoringProperties[anchor_to][current_orientation].x +
									"%; top: " + anchoringProperties[anchor_to][current_orientation].y +
									"%; width: " + anchoringProperties[anchor_to][current_orientation].width +
									"%; height: " + anchoringProperties[anchor_to][current_orientation].height + "%;";
		}
	},
	
	/**
	 * Transforms the viewfinder to reflect scanning area in decoder.
	 */
	rotateAny_toOrientation: function (scanningRect1, to_orientation) {
		
		if (to_orientation < 0 || to_orientation > 2) return;

		var x1 = scanningRect1.x;
		var y1 = scanningRect1.y;
		var w1 = scanningRect1.width;
		var h1 = scanningRect1.height;

		var from_orientation = MW_properties.runtime.viewfinderOnScreenView.orientation; //it was always from landscape (decoder) until now
		
		//[to_orientation] x [from_orientation] //transpose it if you want [from][to]
		/*var orientationRotation = [
			//landscape                                 portrait                                landscape flipped
			[{ x: x1, y: y1, width: w1, height: h1 }, { x: (100 - y1 - h1), y: x1, width: h1, height: w1 }, { x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }], //landscape
			[{ x: y1, y: (100 - x1 - w1), width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }, { x: (100 - y1 - h1), y: (100 - x1 - w1), width: h1, height: w1 }], //portrait
			[{ x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }, { x: y1, y: (100 - x1 - w1), width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }]  //landscape flipped
		];*/

		var orientationRotationT = [
			//landscape                                 portrait                                landscape flipped
			[{ x: x1, y: y1, width: w1, height: h1 }, { x: y1, y: (100 - x1 - w1), width: h1, height: w1 }, { x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }], //landscape
			[{ x: (100 - y1 - h1), y: x1, width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }, { x: y1, y: (100 - x1 - w1), width: h1, height: w1 }], //portrait
			[{ x: (100 - x1 - w1), y: (100 - y1 - h1), width: w1, height: h1 }, { x: (100 - y1 - h1), y: (100 - x1 - w1), width: h1, height: w1 }, { x: x1, y: y1, width: w1, height: h1 }]  //landscape flipped
		];

		return orientationRotationT[from_orientation][to_orientation];
	},

	/**
	 * Transforms the viewfinder to reflect scanning area in decoder 2.
	 */
	scaleFull_toPartial: function (scanningRect1, partialScale, scaleHeight) {
		
		if (partialScale < 0.01 || partialScale > 1.0 || scaleHeight < 0 || scaleHeight > 1) return;

		var x1 = scanningRect1.x;
		var y1 = scanningRect1.y;
		var w1 = scanningRect1.width;
		var h1 = scanningRect1.height;

		var cropScaleP = (1 - partialScale) * 100; //on [0,100) scale
		//[scaleDirection]
		var scale_and_center = [
			//scale down and translate to justified position
			{ x: ((cropScaleP / 2) + (x1 * partialScale)), y: y1, width: (w1 * partialScale), height: h1 }, //scaleWidth
			{ x: x1, y: ((cropScaleP / 2) + (y1 * partialScale)), width: w1, height: (h1 * partialScale) }  //scaleHeight
		];

		return scale_and_center[scaleHeight];
	},
	
	//^ these look nice
	
	/**
	 * Calculates the scanningRects for all codes and sets them in the SDK.
	 */
	calcScanningRect: function (is_portrait, _isDivArHigher, _croppedCameraAreaScale, numberOfSupporedCodes, untouchedScanningRectsArray, viewfinderOnScreenView)
	{
		if (mwb_debug_print) console.log('calcScanningRect(' + is_portrait + ' ' + _isDivArHigher + ' ' + _croppedCameraAreaScale + ') ');

		var viewfinderAreaScale = (1 - _croppedCameraAreaScale);
		
		var widthIndex = 0;
		var heightIndex = 1;
		
		//since w3/mozilla were considerate enough to design an API that results in getting each
		//frame exaclty in the orientation its preview-ed in (unlike landscape only)
		//that messes with the calcs in scaleFull_toPartial, so this small but crucial extra step is needed:
		if (is_portrait)
		{
			widthIndex = 1;
			heightIndex = 0;
		}
		
		var codeMasksArray = MW_properties.global.codeMasksArray; //global (not arg) access like the rest
			//if (mwb_debug_print) console.log('masks');
			//if (mwb_debug_print) console.log(codeMasksArray);
		
		// determine if cutting is done by width or height
		if ((!is_portrait && _isDivArHigher) || (is_portrait && !_isDivArHigher))
		{
			// it's done by height, rare                
			var codeMask, 
				scanningRectTM;

			var i = 0;
			for (; i < numberOfSupporedCodes; i++) {
				// copy needed primitive types BY VALUE | these functions create new structures and assign primitive types by value | no ref here
				scanningRectTM = this.rotateAny_toOrientation(untouchedScanningRectsArray[i], viewfinderOnScreenView.orientation);
				scanningRectTM = this.scaleFull_toPartial(scanningRectTM, viewfinderAreaScale, heightIndex);
				
				//OK, so here, finish with this and the MAIN FLOW of execution, and then see what happens with
				//scanRects vs. the simplest way do to what you need with C++
				
				// set in decoder
				codeMask = codeMasksArray[i];
				//if (mwb_debug_print) console.log(scanningRectTM);
				//HERE - commented out the call to set for test purposes
				BarcodeScanner.MWBsetScanningRect(codeMask, scanningRectTM.x, scanningRectTM.y, scanningRectTM.width, scanningRectTM.height);
			}
		}
		else
		{
			// it's by width, most common
			var codeMask,
				scanningRectTM;

			var i = 0;
			for (; i < numberOfSupporedCodes; i++) {
				
				// copy needed primitive types BY VALUE | these functions create new structures and assign primitive types by value | no ref here
				scanningRectTM = this.rotateAny_toOrientation(untouchedScanningRectsArray[i], viewfinderOnScreenView.orientation);
				scanningRectTM = this.scaleFull_toPartial(scanningRectTM, viewfinderAreaScale, widthIndex);
				
				//HERE undefined .x => because DOM lags, previewFrame is 0, so viewfinderAreaScale is 0, and
				//scaleFull_toPartial checks 0.01 - 1, and just returns, which is undefined for scanningRectTM
				//sol: place resize in setTimeout(0) ?

				// set in decoder
				codeMask = codeMasksArray[i];
				//if (mwb_debug_print) console.log(scanningRectTM);
				//HERE - commented out the call to set for test purposes
				BarcodeScanner.MWBsetScanningRect(codeMask, scanningRectTM.x, scanningRectTM.y, scanningRectTM.width, scanningRectTM.height);
			}
		}
		
		if (true && mwb_debug_print) {
			//get viewfinder			
			var viewfnderUnionRect = BarcodeScanner.MWBgetScanningRect(0); //wait, shouldn't there be an actual call (not just once on start) for changes for this function?
			//cuz this is debug, and optional - not code dependent
			//either missed something when re-using, or no need cuz SR% are wrt. MW_overlay on screen
			//hmmm..
			
			//anyways, lets try without this part-block
			//if (mwb_debug_print) console.log('praame li nesto');
			//if (mwb_debug_print) console.log(viewfnderUnionRect);
			viewfnderUnionRect = JSON.parse(viewfnderUnionRect);
			if (mwb_debug_print) console.log('viewfinderUnion after TM ' + viewfnderUnionRect.x + ' ' + viewfnderUnionRect.y + ' ' + viewfnderUnionRect.width + ' ' + viewfnderUnionRect.height + ' ');
		}
	},
	
	/**
	 * Calculates overlay coordinates for canvas and calls calcScanningRect.
	 */
	calcPreview: function (is_portrait, hardwareCameraResolution, preview, MW_properties, Dynamic_DOM_Elements) {
		
		//obtain args
		var numberOfSupporedCodes = MW_properties.global.numberOfSupporedCodes;
		var untouchedScanningRectsArray = MW_properties.global.untouchedScanningRectsArray;
		var viewfinderOnScreenView = MW_properties.runtime.viewfinderOnScreenView;
		var previewFrame = Dynamic_DOM_Elements.previewFrame;
		
		if (mwb_debug_print) console.log('calcPreview(' + is_portrait + ') ');
		
		var windowWidth = window.innerWidth;
		var windowHeight = window.innerHeight;
		var window_AR = windowWidth / windowHeight;
		var rootDivInviewTop = previewFrame.offsetTop; //or just get it through _DOM ? //document.getElementById("root-div-inview")
		var rootDivInviewLeft = previewFrame.offsetLeft;
		var rootDivInviewWidth = previewFrame.offsetWidth;
		var rootDivInviewHeigth = previewFrame.offsetHeight;
		var rootDivInview_AR = rootDivInviewWidth / rootDivInviewHeigth;
		
		var cameraWidth = hardwareCameraResolution.width;
		var cameraHeight = hardwareCameraResolution.height;
		var camera_AR = cameraWidth / cameraHeight;
		//if (mwb_debug_print) console.log('explorer reporting');
		//if (mwb_debug_print) console.log(cameraWidth + ", " + cameraHeight);
		//if (mwb_debug_print) console.log(camera_AR);
		//DOM elements weren't fully rendered (previewFRame has size of 0)
		//altough it seems (After moving this code after video load) it works just fine, both on firefox and chrome
		
		if (is_portrait) {
			cameraWidth = hardwareCameraResolution.height;
			cameraHeight = hardwareCameraResolution.width;
			camera_AR = cameraWidth / cameraHeight;
			//if (mwb_debug_print) console.log('is_port');
			//if (mwb_debug_print) console.log(cameraWidth + ", " + cameraHeight);
			//if (mwb_debug_print) console.log(camera_AR);
		}
		//if (mwb_debug_print) console.log(JavaScript_mediaDevices_API.runtime_settings_videoTrack.width);
		//if (mwb_debug_print) console.log(JavaScript_mediaDevices_API.runtime_settings_videoTrack.height);
		
		if (mwb_debug_print) console.log("in calcPreview, { "+ rootDivInview_AR +" <> "+ camera_AR +" }" + " { "+ rootDivInviewWidth +" <> "+ rootDivInviewHeigth +" }");

		if (rootDivInview_AR == camera_AR) return;
		else
			if (rootDivInview_AR > camera_AR)
			{
				// fill div by width, most likely portrait
				var scalingFactor = rootDivInviewWidth / cameraWidth;
				var new_cameraHeight = cameraHeight * scalingFactor;
				var croppedCameraArea = new_cameraHeight - rootDivInviewHeigth;
				
				// get percentages:
				var croppedCameraAreaScale = croppedCameraArea / new_cameraHeight;
				var translatedCameraTopP = -(croppedCameraAreaScale / 2) * 100;
				
				preview.style.cssText = "position: absolute; margin: auto; top: 0; bottom: 0; width: 100%; height: auto;";
				
				this.calcScanningRect(is_portrait, true, croppedCameraAreaScale, numberOfSupporedCodes, untouchedScanningRectsArray, viewfinderOnScreenView);
			}
			else
				if (rootDivInview_AR < camera_AR) // default remaining
				{
					//fill div by height
					var scalingFactor = rootDivInviewHeigth / cameraHeight;
					var new_cameraWidth = cameraWidth * scalingFactor;
					var croppedCameraArea = new_cameraWidth - rootDivInviewWidth;

					// get percentages
					var croppedCameraAreaScale = croppedCameraArea / new_cameraWidth;
					var translateCameraLeftP = -(croppedCameraAreaScale / 2) * 100;

					var croppedinDivAreaScale = croppedCameraArea / rootDivInviewWidth;
					var translateinDivLeftP = -(croppedinDivAreaScale / 2) * 100;
					translateinDivLeftP += 0;
					
					preview.style.cssText = "position: absolute; margin-left: " + translateinDivLeftP + "%; width: auto; height: 100%;";
					
					this.calcScanningRect(is_portrait, false, croppedCameraAreaScale, numberOfSupporedCodes, untouchedScanningRectsArray, viewfinderOnScreenView);
				}
	},
	
	/**
	 * Draws overlay lines inside the canvasOverlay area.
	 * @param  {object} lines	canvases for overlay blinking lines
	 * @param  {float} x1		canvasOverlay Left
	 * @param  {float} y1		canvasOverlay Top
	 * @param  {float} w1		canvasOverlay Width
	 * @param  {float} h1		canvasOverlay Left
	 * @param  {float} lineThickness CanvasBlinkingLine lineThickness
	 */
	drawOverlayLines: function (lines, x1, y1, w1, h1, lineThickness) {

		var startLeft = x1;
		var startTop = y1;
		lines.v.style.left = lines.h.style.left = (startLeft - 0) + "px";
		lines.v.style.top = lines.h.style.top = (startTop - 0) + "px";

		lines.v.width = lines.h.width = w1;
		lines.v.height = lines.h.height = h1;
		
		
		lines.v.width = lineThickness;
		lines.v.style.left = (startLeft + (w1 / 2) - (lines.v.width / 2) - 0) + "px";

		lines.h.height = lineThickness;
		lines.h.style.top = (startTop + (h1 / 2) - (lines.h.height / 2) - 0) + "px";
		
		// NOTE: at the time this is called the canvas lines have already been added to the html document and the animation has been started and can't be changed at this point
		// SOLUTION: execute these instructions in createPreview before canvas lines are added (because resize and subsequently this function is called after)
		//canvasBlinkingLineV.style.backgroundColor = canvasBlinkingLineH.style.backgroundColor = mwOverlayProperties.lineColor;
		//canvasBlinkingLineV.style.animation = canvasBlinkingLineH.style.animation = "fadeColor " + mwOverlayProperties.blinkingRate + "ms infinite";
	},
	
	/**
	 * Resizes the canvas to fill browser window dynamically.
	 */
	resizeCanvas: function (MW_properties, Dynamic_DOM_Elements) {
		
		//obtain args
		var viewfinderUnionRect = MW_properties.runtime.untouchedScanningRectsUnion; // get viewfinder (landscape)
		//var viewfinderUnionRect = JSON.parse(BarcodeScanner.MWBgetScanningRect(0));
		
		//var untouchedScanningRectsUnion = MW_properties.runtime.untouchedScanningRectsUnion;
		//untouchedScanningRectsUnion.x = viewfinderUnionRect.x;
		//untouchedScanningRectsUnion.y = viewfinderUnionRect.y;
		//untouchedScanningRectsUnion.width = viewfinderUnionRect.width;
		//untouchedScanningRectsUnion.height = viewfinderUnionRect.height;
		//^THIS is supposed to NOT be touched!
		
		var previewFrame = Dynamic_DOM_Elements.previewFrame;
		var canvasOverlay = Dynamic_DOM_Elements.overlay;
		var lines = MW_properties.global.blinkingLines;
		var flash = Dynamic_DOM_Elements.flash;
		var zoom = Dynamic_DOM_Elements.zoom;
		var mwOverlayProperties = MW_properties.global.overlay;
		var viewfinderOnScreenView = MW_properties.runtime.viewfinderOnScreenView;
		
		if (mwb_debug_print) console.log('resizeCanvas ');

		// set canvas over preview
		canvasOverlay.style.top = previewFrame.style.top;
		canvasOverlay.style.left = previewFrame.style.left;
		canvasOverlay.width = previewFrame.offsetWidth; // capturePreviewFrame is a <div> element so it doesn't have width and height properties
		canvasOverlay.height = previewFrame.offsetHeight;
		// linking image buttons to position
		flash.style.top = (canvasOverlay.offsetTop + 2) + "px";
		flash.style.left = canvasOverlay.offsetLeft + "px";
		zoom.style.top = (canvasOverlay.offsetTop + 2) + "px";
		zoom.style.left = ((canvasOverlay.offsetWidth + canvasOverlay.offsetLeft) - zoom.offsetWidth) + "px";

		// set viewfinder in pixels
		viewfinderOnScreenView.x = canvasOverlay.width * (viewfinderUnionRect.x / 100);
		viewfinderOnScreenView.y = canvasOverlay.height * (viewfinderUnionRect.y / 100);
		viewfinderOnScreenView.width = canvasOverlay.width * (viewfinderUnionRect.width / 100);
		viewfinderOnScreenView.height = canvasOverlay.height * (viewfinderUnionRect.height / 100);

		/**
		 * Your drawings need to be inside this function otherwise they will be reset when 
		 * you resize the browser window and the canvas goes will be cleared.
		 */
		
		if (mwOverlayProperties.mode == 0) return;
		
		var ctx = canvasOverlay.getContext("2d");
			
		if (mwOverlayProperties.mode == 1)
		{
			// draw fullcanvas shadow and clear the viewfinder area
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
			ctx.fillRect(0, 0, canvasOverlay.width, canvasOverlay.height);
			ctx.clearRect(viewfinderOnScreenView.x, viewfinderOnScreenView.y, viewfinderOnScreenView.width, viewfinderOnScreenView.height);

			// draw red viewfinder border
			ctx.lineWidth = mwOverlayProperties.borderWidth;
			ctx.strokeStyle = mwOverlayProperties.lineColor;
			ctx.strokeRect(viewfinderOnScreenView.x, viewfinderOnScreenView.y, viewfinderOnScreenView.width, viewfinderOnScreenView.height);
			
			// draw red lines
			this.drawOverlayLines(
			lines,
			canvasOverlay.offsetLeft + viewfinderOnScreenView.x,
			canvasOverlay.offsetTop + viewfinderOnScreenView.y,
			viewfinderOnScreenView.width,
			viewfinderOnScreenView.height,
			mwOverlayProperties.linesWidth);
		}
		else if (mwOverlayProperties.mode == 2)
		{
			// if mwOverlay mode is set to image hide lines | place in createPreview
            //if (mwOverlayProperties.mode == 2) {
            //    mwBlinkingLines.v.style.visibility = "hidden";
            //    mwBlinkingLines.h.style.visibility = "hidden";
            //}
			
			//if (document.getElementById("canvas-line-v") != null) document.getElementById("canvas-line-v").style.visibility = "hidden"; // handled in createPreview
			//if (document.getElementById("canvas-line-h") != null) document.getElementById("canvas-line-h").style.visibility = "hidden";

			var imageOverlay = document.createElement("img");
			imageOverlay.src = mwOverlayProperties.imageSrc;

			imageOverlay.onload = function () {
				ctx.drawImage(imageOverlay, 0, 0, imageOverlay.width, imageOverlay.height,      // source rectangle
											0, 0, canvasOverlay.width, canvasOverlay.height);   // destination rectangle
			}
		}
	},
	
	/**
	 * Resize partial scanning view.
	 */
	resizePartialScannerView: async function resizeView(MW_properties, Dynamic_DOM_Elements) { //function name not needed | also this was referenced from global var
		//setTimeout(function(){let this_root = MW_methods;
		//obtain needed args
		var hideDuringUpdate = MW_properties.global.hideDuringUpdate;
		var proxyWrapPreview = Dynamic_DOM_Elements.proxyWrapPreview;
		var lines = MW_properties.global.blinkingLines; //Dynamic_DOM_Elements.lines; //_DOM doesn't work but MW_ works (its the time of setting those)
		
		var previewFrame = Dynamic_DOM_Elements.previewFrame;
		var partialView = MW_properties.global.partialView;
		var viewfinderOnScreenView = MW_properties.runtime.viewfinderOnScreenView;
		
		var is_portrait = MW_properties.runtime.is_portrait;
		var hardwareCameraResolution = MW_properties.global.hardwareCameraResolution;
		var preview = Dynamic_DOM_Elements.preview;
		
		//var viewfinderUnionRect = MW_properties.runtime.untouchedScanningRectsUnion;
		//var canvasOverlay = Dynamic_DOM_Elements.canvas;
		//var flash = Dynamic_DOM_Elements.flash;
		//var zoom = Dynamic_DOM_Elements.zoom;
		//var mwOverlayProperties = MW_properties.global.overlay;
		
		if (mwb_debug_print) console.log('resizePartialView | window size ' + window.innerWidth + ' ' + window.innerHeight);

		// USE THIS IF YOU WANT TO STORE THE VALUES OF THE RESIZE FOR THE NEXT SCAN
		/*partialView.x = x1;
		partialView.y = y1;
		partialView.width = w1;
		partialView.height = h1;*/

		// improve UIX during update | users don't need to see the underlying changes only the final result
		if (hideDuringUpdate) {
			proxyWrapPreview.style.visibility = "hidden"; //HERE
			//canvasOverlay.style.display = "none";
			lines.v.style.display = "none";
			lines.h.style.display = "none";
		}
			
		if (mwb_debug_print) console.log('anchorView_toOrientation: ' + 'anchor_to ' + partialView.orientation + ' -> ' + 'current_orientation ' + viewfinderOnScreenView.orientation);
		this.anchorView_toOrientation(previewFrame, partialView.x, partialView.y, partialView.width, partialView.height, partialView.orientation, viewfinderOnScreenView.orientation);
		//HERE - either anchorView_toOrientation messes up, or the DOM is lagging after the resize event is fired and so previewFrame height is 0 - in which case, use setTimeout(0) | so lets get to it
		
		
		if (mwb_debug_print) console.log('is in the clouds');
		if (mwb_debug_print) console.log('anchor: ' + partialView.orientation + " [0-3], " + viewfinderOnScreenView.orientation + " [0-2]");
		
		//maybe wait(1) between these calcs?
		
		this.calcPreview(is_portrait, hardwareCameraResolution, preview, MW_properties, Dynamic_DOM_Elements); //ALSO HERE - or previewFrame direct?
		this.resizeCanvas(MW_properties, Dynamic_DOM_Elements);
		// reappear video preview
		setTimeout(function () {
			if (hideDuringUpdate) {
				proxyWrapPreview.style.visibility = "visible";
				//canvasOverlay.style.display = "initial";
				lines.v.style.display = "initial";
				lines.h.style.display = "initial";
			}
		}, 1000); //THIS might be able to do with less - depending on device's speed?
		//}, 100);
	},
	
	eventHandlers: {
		//
		resize: function(e) {
			
			if (mwb_debug_print) { console.log('window resized'); console.log(e); }
			MW_methods.resizePartialScannerView(MW_properties, Dynamic_DOM_Elements);
		}
	},
	
	helpers: {
		already_inited: false,
		init_codeMasks_and_scanRects_and_union: function (MW_properties) {
			
			var _numberOfSupporedCodes = MW_properties.global.numberOfSupporedCodes;
			var codeMasksArray = MW_properties.global.codeMasksArray;
			var untouchedScanningRectsArray = MW_properties.global.untouchedScanningRectsArray;
			var untouchedScanningRectsUnion = MW_properties.runtime.untouchedScanningRectsUnion;
			
			if (!this.already_inited) //fill arrays first time
			{
				//BarcodeScanner.MWBinitDecoder(); //calling it here ensures the calls went thru | calling prinf after init in C++ also does that
				//leaving it to main, might take a while (after this point) so either call this in module.print or above call
				for (var _i = 0; _i < _numberOfSupporedCodes; _i++)
				{			
					codeMasksArray.push(Math.pow(2, _i));
					
					var rect = BarcodeScanner.MWBgetScanningRect(codeMasksArray[_i]);
					//if (mwb_debug_print) console.log(codeMasksArray[_i] + ', ');
					//if (mwb_debug_print) console.log(rect);
					var rect = JSON.parse(rect);
					untouchedScanningRectsArray.push(rect);
				}
				
				this.already_inited = true;
			}
			else //2+ 'th start
			{				
				for (var _i = 0; _i < _numberOfSupporedCodes; _i++)
				{					
					var rect = BarcodeScanner.MWBgetScanningRect(codeMasksArray[_i]);
					//if (mwb_debug_print) console.log(codeMasksArray[_i] + ', ');
					//if (mwb_debug_print) console.log(rect);
					var rect = JSON.parse(rect);
					untouchedScanningRectsArray[_i] = rect;
				}
			}
			
			//nope, still not as needed - LOOK BETTER INTO IT
			
			/*
			that setup is fine, but - you are supposed to call union (0) again, at a new run/start
			because in the meantime, scanRects and/or activeCodes (and their scanRects, and the union)
			might have changed
			
			well same goes for all scanRects, and the 'untouched' refers to them not being altered to fit
			resizes and preview crop transformation changes
			*/
			
			//if (mwb_debug_print) console.log(untouchedScanningRectsArray);
			var sdk_union = JSON.parse(BarcodeScanner.MWBgetScanningRect(0));
			
			untouchedScanningRectsUnion.x = sdk_union.x;
			untouchedScanningRectsUnion.y = sdk_union.y;
			untouchedScanningRectsUnion.width = sdk_union.width;
			untouchedScanningRectsUnion.height = sdk_union.height;

			if (mwb_debug_print) console.log('-> one-time initCodeMasksArray_and_untouchedScanningRectsArray_and_untouchedScanningRectsUnion ')
		},
		
		reset_Decoder: function () { if (mwb_debug_print) console.log('reset scanning rects'); BarcodeScanner.MWBinitDecoder(); },
		
		IsJsonString: function (jsonString, jsonDefault) { //add it later (on 5 total places)
			var jsonObject = null;
			try {
				jsonObject = JSON.parse(jsonString);
			} catch (e) {
				return jsonDefault;
			}
			return jsonObject;
		},
		
		//orientation
		OrientationType_hash: [],
		
		OrientationType_hash_init: function ()
		{
			//enum OrientationType {
			//	"portrait-primary",
			//	"portrait-secondary",
			//	"landscape-primary",
			//	"landscape-secondary"
			//};
			
			//var OrientationType_hash = [];
			this.OrientationType_hash["landscape-primary"] 	= 0;
			this.OrientationType_hash["portrait-primary"] 	= 1;
			this.OrientationType_hash["landscape-secondary"]= 2;
			//if (mwb_debug_print) console.log(this.OrientationType_hash); //[] (0) in Safari
		},
		
		_Screen_Orientation: (typeof screen.orientation === 'undefined') ? 'undefined' : screen.orientation,
		orientationChangeHandler: function () {
			//if (mwb_debug_print) console.log('its magic');
			//if (mwb_debug_print) console.log(screen);
			//if (mwb_debug_print) console.log(typeof screen); //object on Safari
			//if (mwb_debug_print) console.log(screen.orientation);
			//if (mwb_debug_print) console.log(typeof screen.orientation); //undefined on Safari
			
			//call here if (typeof MW_methods.helpers._Screen_Orientation === 'undefined')
				//or differnt handler
			
			let orientation_number = 0; //land assumed for default
			
			if (MW_methods.helpers._Screen_Orientation === 'undefined') //because of ctx change that will be undefined (different than 'undefined' of type string)
			{
				//welcome
				orientation_number = (window.innerWidth > window.innerHeight) ? /*MW_methods.helpers.OrientationType_hash["landscape-primary"]*/ 0 : /*MW_methods.helpers.OrientationType_hash["portrait-primary"]*/ 1;
				
				if (mwb_debug_print) console.log('HMM ' + screen.width + " " + screen.height + " => " + orientation_number); //screen wh are different than window.inner wh
				
				//also obtain availHeight, availLeft, availTop, availWidth and previous orientation
				//that will give you a clue about land or land-flipped
			}
			else
			{
				//logs
				if (mwb_debug_print) console.log('ORIENTATION CHANGE ' + MW_methods.helpers._Screen_Orientation);
				//if (mwb_debug_print) console.log(MW_methods.helpers.OrientationType_hash);
				//set properties
				orientation_number = MW_methods.helpers.OrientationType_hash[MW_methods.helpers._Screen_Orientation.type];
			}
			
			//
			
			let is_portrait = ((orientation_number % 2) == 1);
			if (mwb_debug_print) console.log(orientation_number + ' & ' + is_portrait);
			
			let prev_is_portrait = MW_properties.runtime.is_portrait;
			
			MW_properties.runtime.viewfinderOnScreenView.orientation = orientation_number;
			MW_properties.runtime.is_portrait = is_portrait;
			
			if (mwb_debug_print) console.log("HMM " + MW_properties.runtime.is_portrait);
			
			//since w3/mozilla were considerate enough to design an API that results in getting each
			//frame exaclty in the orientation its preview-ed in (unlike landscape only),
			//the hardwareCameraResolution also has to change values to reflect that when in portrait (already had been handled in calcPreview)
			{
				//no need to obtain frame size values from video, a simple swap should suffice
				//but that requires too many extra steps, so best to do it str8 from the source
				var videoWidth = Dynamic_DOM_Elements.preview.videoWidth,// || video.naturalWidth;
				videoHeight = Dynamic_DOM_Elements.preview.videoHeight;// || video.naturalHeight;
				
				//MW_properties.global.hardwareCameraResolution.width = videoWidth;
				//MW_properties.global.hardwareCameraResolution.height = videoHeight;
				
				//does it change at this point tho? -y.
				if (mwb_debug_print) console.log('new frame size: ' + videoWidth + 'x' + videoHeight);
				
				//MW_properties.global.hardwareCameraResolution assumes static WxH
				//for camera, e.g. 1280x720, regardless of land/port
				//since Safari doens't get its camera WH values from runtime caps api
				//it gets them from here, BUT the higher value MUST ALWAYS BE WIDTH
				
				var videoWidth_b = videoWidth,
					videoHeight_s = videoHeight;
					
				if (videoWidth < videoHeight)
				{
					videoWidth_b = videoHeight;
					videoHeight_s = videoWidth;
				}
				
				if (mwb_debug_print) console.log('explorer reporting');
				//if (MW_properties.global.hardwareCameraResolution.width == 0) //or JavaScript_mediaDevices_API.runtime_settings_videoTrack.width
				MW_properties.global.hardwareCameraResolution.width  = videoWidth_b;
				//if (MW_properties.global.hardwareCameraResolution.height == 0) //or JavaScript_mediaDevices_API.runtime_settings_videoTrack.height
				MW_properties.global.hardwareCameraResolution.height = videoHeight_s;
				
				//there seems to be some override on 2+ runs/reloads in Safari
				//so the portrait bug is fixed on 1st run, but re-appears on 2+
				//so lets set those values always, for now (they should be the same anyways)
				
				
				if (mwb_debug_print) console.log(MW_properties.global.hardwareCameraResolution);
			}
			
			// PREVIEW UPDATE SHOULD BE DONE AFTER UI CHANGE WHICH MAY TAKE SOME TIME TO COMPLETE RENDERING AFTER ORIENTATION CHANGE | HANDLED BY window.resizeEvent->resizePartialScannerView
		},
		
		safari_video_click_workaround: function (video) {
			let virtual_button = document.createElement('button');
			virtual_button.onclick = function() {
				//
				video.play(); if (mwb_debug_print) console.log('calling play again 3');
				
				//at this point its Safari
				if (mwb_debug_print) setTimeout(function() {
					//MWBScanner.resizePreview(2, 2, 96, 50);			
					if (mwb_debug_print) console.log(Dynamic_DOM_Elements.preview);
				}, 2500);
				
				this.onclick = null;
			};
			virtual_button.click();
		},
		
		get_number_of_Digits: function(x) {
			return (Math.log10((x ^ (x >> 31)) - (x >> 31)) | 0) + 1;
		},
		
		otherResult: function (code, type) {
			return {
				code: code,
				parsedCode: null,
				type: type,
				isGS1: null,
				bytes: null,
				location: null,
				imageWidth: null,
				imageHeight: null
			};
		}
	}
};

var timePoll = 0; //for dev / testing (preview height 0 bug specifically), rm later
var callCount = 0;


//4. execution flow control, pauseDecoder, args, pointers, scanImage, result callbck,
//	[future: pthreads, altho its not 'real' mthreading], clean-free
var MWBScanner = {
	
	DECODER_ACTIVE: false, //or-and pause | also, SCANNER_ACTIVE/started might be better
	
	CONTINUOUS_DECODING: false, //
	
	USE_PARSER: true, //internal use only, as in, results gets parsed on C++ side always, but this flag determines presentation or not
	
	decoder_timeout: 30, //link it w/ "30 *"
	
	dps_limit: 20,
	
	PAUSE_DECODING: false, //runtime
	
	external_helper: null, //will be set from main.js | was for gui
	
	result_callback: null,
	
	decoder: async function (video) {
		
		const DEBUG_PRINT = 0;
		var BEEP_ON_SUCCESS = false;
		var jump = 1; var jmp_count = 0; //jump one means every result is beep-ed, do not use 0 because that will be undefined
		//
		var dataPtr = null;
		var callCount = 0;
		const frameInterval = 1000 / MWBScanner.dps_limit; //50; //calc this HERE from setting
		const minTimeout = MWBScanner.decoder_timeout; //10; //this is not the ACTUAL timeout (see that "30 *" timer) //tho this isn't used - scanner_timeout is the real true timeout, which unsets DECODER_ACTIVE, which is the condition that will execute clearInterval on the next frame
		
		const totalFrames = ( 1000 / frameInterval ) * minTimeout;
		
		//var DECODER_ACTIVE = true;
		var startTime = performance.now(); //new Date().getTime();
		//
		var videoWidth = video.videoWidth,// || video.naturalWidth;
			videoHeight = video.videoHeight;// || video.naturalHeight;
		
		if (mwb_debug_print) console.log('loaded metadata of video, w,h: ' + videoWidth + ', ' + videoHeight); //w,h have values i.e. 640,480 as soon as loadedmetadata Event (first frame loaded)
			
		//can also call explorer reporting here, but resize should always be called before reaching the decoder
			
		let mwOverlayProperties = MW_properties.global.overlay;
		let viewfinderOnScreen = MW_properties.runtime.viewfinderOnScreenView;
		
		var startFrameScanning = setInterval(async function () {
			//processing
			callCount++;
			if (!MWBScanner.DECODER_ACTIVE/*callCount > totalFrames*/) { clearInterval(startFrameScanning); return; }
			
			if (MWBScanner.PAUSE_DECODING) return;
			
			//relevant on orientation change
			videoWidth = video.videoWidth;
			videoHeight = video.videoHeight;
			
			var canvasFrame = document.createElement("canvas");
			var pad = 0;
			
			canvasFrame.width = videoWidth  + (pad * 2);
			canvasFrame.height = videoHeight + (pad * 2);
			
			var ctx = canvasFrame.getContext("2d");
			
			ctx.drawImage(video, 0, 0, videoWidth, videoHeight); //source rectangle
			var imgData = ctx.getImageData(0, 0, canvasFrame.width, canvasFrame.height);
			var data = imgData.data; //new Uint8ClampedArray([1, 20, -3, 129, 15]); //checks out
			var nDataBytes = data.length * data.BYTES_PER_ELEMENT;
			
			dataPtr = Module._malloc(nDataBytes); //buffer
			Module.HEAPU8.set(data, dataPtr); //[typedArray_dataSource, heapMemory_pointer]
			
			// Call function and get result
			var jsonMWResult = "";
			var scanFrame = Module.cwrap('scanFrame', 'string', ['number', 'number', 'number', 'number']); //for some reason this has to be inside this scope
			//probs asign cwrap when Module is loaded
			
			//NOTE: no need to keep MWB_functions here as they work when defined outside but called in this scope (unlike scanFrame)
			
			startTime = performance.now(); //new Date().getTime();
			
			//set active symbologies (and all other native sdk settings) before decoding
			
			//frame TEST			
			if (false && mwb_debug_print && (callCount == ((totalFrames/4) - 1)))
			{
				//
				console.log('frame TEST x');
				let url = canvasFrame.toDataURL();
				let windowName = 'majni';
				//window.open(url, windowName);
				
				console.log(url);
			}
			
			jsonMWResult = scanFrame(dataPtr, canvasFrame.width, canvasFrame.height, DEBUG_PRINT); //dataURL is png (no bmp or something raw)
			
			var dps = 1000/(performance.now() - startTime); //not sure if this way of doing things results in proper dps
			//actually this is correct, the reason why it takes longer for frames to 'run out' is frameInterval being 50ms
			//which limits max fps to 20
			
			var MWResult_obj = (DEBUG_PRINT == 0) ? JSON.parse(jsonMWResult) : jsonMWResult;
			
			//MWResult_obj take .code and JSON.parse it as well (but how can we know if its JSON result from the parser? -needs indicator)
			
			if (DEBUG_PRINT) { console.log(MWResult_obj); return; }
			
			if (MWResult_obj.type == "No MWResult.") //maybe check for undefined
			{
				if (mwb_debug_print) console.log( "dps(" + Math.round(dps) + "), frame " + callCount + " : " + MWResult_obj.code + " " + MWResult_obj.type );
			}
			else
			{
				//location
				let result = MWResult_obj;
				if (result != null && result.locationPoints != null)
				{
					//capturePreview.pause();
					//MWOverlay location points green box draw
					let canvasOverlay = Dynamic_DOM_Elements.overlay;
					let preview = Dynamic_DOM_Elements.preview;
					
					//if (mwb_debug_print) console.log(preview.offsetWidth); //one of preview's sides will be cropped and bigger than canvasOverlay | note: preview.width (and height) are 0
					//if (mwb_debug_print) console.log(preview.offsetHeight);
					//if (mwb_debug_print) console.log(canvasOverlay.width);
					//if (mwb_debug_print) console.log(canvasOverlay.height);
					
					var ctx = canvasOverlay.getContext("2d");

					if (mwb_debug_print) console.log("location points:");
					if (mwb_debug_print) console.log(result.locationPoints);
					
					//let mwOverlayProperties = MW_properties.global.overlay;
					//let viewfinderOnScreen = MW_properties.runtime.viewfinderOnScreenView;
					
					ctx.lineWidth = mwOverlayProperties.borderWidth * 1; //location lines thickness
					ctx.strokeStyle = mwOverlayProperties.locationColor;

					var navigationBarHeight = (window.innerWidth > window.innerHeight) ? ((window.innerHeight * (16 / 9)) - window.innerWidth) : ((window.innerWidth * (16 / 9)) - window.innerHeight);
					
					navigationBarHeight = 0; //above is only good for windows phone

					//mwb_debug_print = true;
					if (mwb_debug_print) console.log('navigationBarHeight: ' + navigationBarHeight);

					var window_actualWidth = preview.offsetWidth;//canvasOverlay.width;//window.innerWidth;
					var window_actualHeight = preview.offsetHeight;//canvasOverlay.height;//window.innerHeight;

					//when the navigation bar is present, the image is pushed/translated by the size of the navigation bar
					if (viewfinderOnScreen.orientation == 0 || viewfinderOnScreen.orientation == 2) //landscape or flipped landscape
					{
						window_actualWidth += navigationBarHeight;
					}
					else //portrait
					{
						window_actualHeight += navigationBarHeight;
					}
					
					var translate_x = preview.offsetWidth - canvasOverlay.width;
					var translate_y = preview.offsetHeight - canvasOverlay.height;
					translate_x /= 2;
					translate_y /= 2;
					
					var scale_x = window_actualWidth / result.imageWidth;
					var scale_y = window_actualHeight / result.imageHeight;

					if (mwb_debug_print) console.log('screen w h : ' + window.innerWidth + ' ' + window.innerHeight + ' image w h : ' + result.imageWidth + ' ' + result.imageHeight + ' scales x y : ' + scale_x + ' ' + scale_y);
					
					//alert('image w h : ' + result.imageWidth + ' ' + result.imageHeight); //TEST-DEL
					
					if (false && viewfinderOnScreen.orientation == 1) //swap scales operands to account for the rotation
					{
						scale_x = window_actualWidth / result.imageHeight;
						scale_y = window_actualHeight / result.imageWidth;
						
						//most likely there won't be any need to swap translates
						//because they aren't tied with image - however, TEST!
					}

					//viewfinderOnScreen.orientation 1 port 2 flipped land
					var coordSysOrigin_x_Axis_toCenter = 0;
					var coordSysOrigin_y_Axis_toCenter = 0;

					if (false && viewfinderOnScreen.orientation != 0) //if not landscape, do some transformations to match the position on the current orientation
					{
						coordSysOrigin_x_Axis_toCenter = canvasOverlay.width / 2; //this /2 is correct
						coordSysOrigin_y_Axis_toCenter = canvasOverlay.height / 2;

						ctx.translate(coordSysOrigin_x_Axis_toCenter, coordSysOrigin_y_Axis_toCenter);
						ctx.rotate(viewfinderOnScreen.orientation * 90 * Math.PI / 180);
					}
					
					ctx.translate(-navigationBarHeight / 2, 0); //this needs to be /2 no matter what the scale_x value is

					if (!mwOverlayProperties.locationAllPointsDraw) //draw box from p1 and p3
					{
						var x = result.locationPoints.p1.x;
						var y = result.locationPoints.p1.y;

						var w = result.locationPoints.p3.x - x;
						var h = result.locationPoints.p3.y - y;

						x *= scale_x;
						y *= scale_y;
						w *= scale_x;
						h *= scale_y;

						//draw green location border polygon | swap translation back operands to account for the different width and height for portrait, otherwise just normal translation back
						if (viewfinderOnScreen.orientation == 1)
						{
							ctx.strokeRect(x - coordSysOrigin_y_Axis_toCenter, y - coordSysOrigin_x_Axis_toCenter, w, h);
						}
						else ctx.strokeRect(x - coordSysOrigin_x_Axis_toCenter, y - coordSysOrigin_y_Axis_toCenter, w, h);
					}
					else
					{
						var x1 = result.locationPoints.p1.x;
						var y1 = result.locationPoints.p1.y;
						var x2 = result.locationPoints.p2.x;
						var y2 = result.locationPoints.p2.y;
						var x3 = result.locationPoints.p3.x;
						var y3 = result.locationPoints.p3.y;
						var x4 = result.locationPoints.p4.x;
						var y4 = result.locationPoints.p4.y;
						
						x1 *= scale_x;
						y1 *= scale_y;
						x2 *= scale_x;
						y2 *= scale_y;
						x3 *= scale_x;
						y3 *= scale_y;
						x4 *= scale_x;
						y4 *= scale_y;
						
						x1 -= translate_x;
						y1 -= translate_y;
						x2 -= translate_x;
						y2 -= translate_y;
						x3 -= translate_x;
						y3 -= translate_y;
						x4 -= translate_x;
						y4 -= translate_y;
						
						if (mwb_debug_print) ctx.strokeStyle = "rgba(255, 225, 0, 1.0)";

						//draw green location border lines | swap translation back operands to account for the different width and height for portrait, otherwise just normal translation back
						if (viewfinderOnScreen.orientation == 1)
						{
							ctx.beginPath();
							ctx.moveTo(x1 - coordSysOrigin_y_Axis_toCenter, y1 - coordSysOrigin_x_Axis_toCenter);
							ctx.lineTo(x2 - coordSysOrigin_y_Axis_toCenter, y2 - coordSysOrigin_x_Axis_toCenter);
							ctx.lineTo(x3 - coordSysOrigin_y_Axis_toCenter, y3 - coordSysOrigin_x_Axis_toCenter);
							ctx.lineTo(x4 - coordSysOrigin_y_Axis_toCenter, y4 - coordSysOrigin_x_Axis_toCenter);
							ctx.lineTo(x1 - coordSysOrigin_y_Axis_toCenter, y1 - coordSysOrigin_x_Axis_toCenter);

							ctx.stroke();
						}
						else
						{
							ctx.beginPath();
							ctx.moveTo(x1 - coordSysOrigin_x_Axis_toCenter, y1 - coordSysOrigin_y_Axis_toCenter);
							ctx.lineTo(x2 - coordSysOrigin_x_Axis_toCenter, y2 - coordSysOrigin_y_Axis_toCenter);
							ctx.lineTo(x3 - coordSysOrigin_x_Axis_toCenter, y3 - coordSysOrigin_y_Axis_toCenter);
							ctx.lineTo(x4 - coordSysOrigin_x_Axis_toCenter, y4 - coordSysOrigin_y_Axis_toCenter);
							ctx.lineTo(x1 - coordSysOrigin_x_Axis_toCenter, y1 - coordSysOrigin_y_Axis_toCenter);

							ctx.stroke();
						}
						
						//ctx.beginPath();
						//ctx.moveTo(x1, y1);
						//ctx.lineTo(x2, y2);
						//ctx.lineTo(x3, y3);
						//ctx.lineTo(x4, y4);
						//ctx.lineTo(x1, y1);

						//ctx.stroke();
					}
				}
				
				if (BEEP_ON_SUCCESS && ++jmp_count % jump == 0) mwbScanner.beep();
				
				//var successString = "dps(" + Math.round(dps) + "), good frame " + callCount + " ... " + jsonMWResult + "\n\n" + MWResult_obj.code;
				//if (mwb_debug_print) console.log("decoded string (" + callCount + ") " + MWResult_obj.code);
				
				//SHOW RESULT STRING HERE
				if (MWBScanner.CONTINUOUS_DECODING)
				{
					var successString = "dps(" + Math.round(dps) + "), good frame " + callCount + " ... " + jsonMWResult + "\n\n" + MWResult_obj.code;
					
					//MWBcloseScannerOnDecode dependency
					MWBScanner.PAUSE_DECODING = true;
					
					const wait = ms => new Promise(resolve => setTimeout(resolve, ms)); //keep this in common place - helpers
					await wait(128);
					
					if (MWBScanner.result_callback) //return to callback!
						MWBScanner.result_callback(MWResult_obj);
					else
						if (mwb_debug_print) console.log("decoded string (" + callCount + ") " + MWResult_obj.code);
					
				}
				else
				{
					MWBScanner.PAUSE_DECODING = true; //lock it from being changable from the gui/outside
					
					//pause preview so frame fits the location
					Dynamic_DOM_Elements.preview.pause();
					
					//show location breefly
					const wait = ms => new Promise(resolve => setTimeout(resolve, ms)); //keep this in common place - helpers
					await wait(mwOverlayProperties.locationShowTime);
					
					MWBScanner.destroyPreview(true); //has_res
					await wait(128); //wait a bit for DOM actions to complete
					//100 - PC
					//1500 Note5
					//rather fast on LG
					
					//maybe poll DOM state then show alert (or clbck)
					
					MWBScanner.PAUSE_DECODING = false; //put this back (or prev runtime/gui setting?)
					
					//API callback
					if (MWBScanner.result_callback) //return to callback!
						MWBScanner.result_callback(MWResult_obj);
					else
						if (mwb_debug_print) console.log("decoded string (" + callCount + ") " + MWResult_obj.code);
					
					//var jsonObject_ParserResult = JSON.parse(MWResult_obj.code);
					
					/*if (MWBScanner.USE_PARSER) alert(MWResult_obj.type + "\n\n" + MWResult_obj.code); //same?
					else alert(MWResult_obj.type + "\n\n" + MWResult_obj.code);*/
					
					//gui
					/*let result_element_title = document.getElementById('MWResult_title');
					result_element_title.innerHTML = " \n" + MWResult_obj.type + "\n ";
					
					let result_element = document.getElementById('MWResult');
					result_element.innerHTML = " \n" + MWResult_obj.code + "\n \n ";
					
					let result_element_wrapper = document.getElementById('MWResult_wrap');
					//this style only for 'scrollable result' mostly PDF
					//result_element_wrapper.style.height = "auto";
					//result_element_wrapper.style.position = "absolute";
					result_element_wrapper.style.visibility = "visible";
					
					//as for the result being 'scrollable' if longer than screen (parsed json),
					//poll the offestHeight, if more than window.height, then style.position = as needed
					//else = other as needed
					
					if (result_element_wrapper.offsetHeight > window.innerHeight)
					{
						result_element_wrapper.style.position = "absolute";
					}
					else
					{
						result_element_wrapper.style.position = "fixed";
					}
					
					MWBScanner.gui_demo_controls_Array[0].element_ref.scrollIntoView(false); //will scroll to top where result starts from
					
					//for some reason, maybe related to this, toggle buttons have that lag, it happens only when result > screen
					
					let button1 = document.getElementsByClassName('button1')[0];
					let button2 = document.getElementsByClassName('button2')[0];
					
					button1.style.visibility = "hidden";
					
					button2.innerHTML = "OK";
					button2.onclick = function () {
						
						let result_element_wrapper = document.getElementById('MWResult_wrap');
						result_element_wrapper.style.visibility = "hidden";
				
						let result_element_title = document.getElementById('MWResult_title');
						result_element_title.innerHTML = "";
						
						let result_element = document.getElementById('MWResult');
						result_element.innerHTML = "";
						
						//button2
						this.onclick = mwbScanner.closeScanner;
						this.innerHTML = "Stop";
						this.style.visibility = "visible";
						
						let button1 = document.getElementsByClassName('button1')[0];
						
						button1.style.visibility = "visible";
					}*/					
				}
			}
			
			
			// Free memory
			Module._free(dataPtr); //but what if you change the address the dataPtr points to in C++ | Verify, and if true, store a copy to restore OG from (or just -= size)
			dataPtr = null;
			Module._free(jsonMWResult);
			
			//if (mwb_debug_print) console.log('--------------------------------> b4'); //reaches
			//if ((callCount == (totalFrames - 1)) && JavaScript_mediaDevices_API.videoTrack != null) { JavaScript_mediaDevices_API.videoTrack.stop(); //null check!
			//if (mwb_debug_print) console.log('and after'); }
			//works, but is already handled in onloadedmetadata event => true timer
			
		}, frameInterval); 
	},
	
	start: async function (callback/*, container*/) { //result_clb, video
		
		if (MWBScanner.DECODER_ACTIVE) return null; //can't start two
		MWBScanner.DECODER_ACTIVE = true;
		
		//MWBScanner.external_helper(MWBScanner.DECODER_ACTIVE); //gui
		
		//BarcodeScanner.MWBinitDecoder(); THIS TOO PROBS - TESTING W/ DM makes the preview (and decoder) act strangely - investigate! -got em! it was setting the next mask in the custom handlers, needs to be 2^value_i - 1
		
		//set container in MW_properties.global.container, then,
		//MW_properties.global.container = container;
		//this.resizePreview(0, 0, 100, 100);
		//MW_properties.global.video = video; //also use this if there in _DOM_elements (not creating a new one) //actually, no need to do this
		
		MWBScanner.result_callback = ((typeof callback) == 'function') ? callback : mwbScanner.dflt_clb;
		
		async function after_VideoLoadedData (mediaStream) {
		
		MW_methods.helpers.reset_Decoder(); //this here -
		//call on each start scan //above method calls it as well
		//BUT - scannerConfig() needs to be called AFTER
		//AAND - reset should happen BEFORE init, cause init gets
		
		//scannerConfig(); //HERE - previous set(s) from GUI will be overrided, wb HERE? -y.
		
		//if (!Dynamic_DOM_Elements.already_inited)
		await MW_methods.helpers.init_codeMasks_and_scanRects_and_union(MW_properties);
		
		//probs wait not needed:
		const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
		await wait(1); //loading video takes some time, try in play (or pool the state each, say, 50ms, for size != 0)
		Dynamic_DOM_Elements.revealElements(); //calling it here after wait(1) works just fine for no 'flashing inter-transformation changes'
		//again, you might need to use hidden and then reveal after calcs have finished, and also those internal none-initial
		
		//^THAT HAS TO BE DONE BEFORE resize, so that elements are properly calced together wrt. eachother.
		//only thing you might want to try, is making them hidden instead of display none
		
		//if that works, it should result in everything being already transformed and in place, and can even be appeared at once
		//on first frame (rn its black previewFrame after T, then MW_overlay appears, transforms, and plays)
		
		//to get out of FS
		//document.addEventListener('backbutton', function(){MWBScanner.destroyPreview()}, false); //doesn't work
		
		MW_methods.helpers.OrientationType_hash_init();
		
		//first time 4 everything | only if != landscape
		//if (MW_methods.helpers.OrientationType_hash[screen.orientation.type] != 0)
		MW_methods.helpers.orientationChangeHandler();
		
		if (MW_methods.helpers._Screen_Orientation === 'undefined')
		{
			//
			window.addEventListener('resize', MW_methods.helpers.orientationChangeHandler, false); //same handler - checks inside, for now
		}
		else
		{
			//window.
			screen.orientation.addEventListener('change', MW_methods.helpers.orientationChangeHandler);
		}
				
		window.addEventListener('resize', MW_methods.eventHandlers.resize, false);
		
		await MW_methods.resizePartialScannerView(MW_properties, Dynamic_DOM_Elements); //anchor, calcP, resizeC - which is also to be called on orient/windows size changes
		//await MW_methods.calcPreview(MW_properties.runtime.is_portrait, MW_properties.global.hardwareCameraResolution, Dynamic_DOM_Elements.preview, MW_properties, Dynamic_DOM_Elements);
		//await MW_methods.resizeCanvas(MW_properties, Dynamic_DOM_Elements);
		
		//MWBScanner.DECODER_ACTIVE = true;
		
		//if (mwb_debug_print) console.log(typeof MWBScanner.decoder);
		await MWBScanner.decoder(Dynamic_DOM_Elements.preview);
		//actually this point isn't even reached
		
		//DEBUG: USE THIS TO TEST RESIZE
		//setTimeout(function () {
		//	//if (mwb_debug_print) console.log(document.body.innerHTML); //doesn't print longer strings in console
		//	MW_properties.global.partialView.x = 30;
		//	MW_properties.global.partialView.y = 10;
		//	MW_properties.global.partialView.width = 30; //this can also be wrapped for fullscreen, and for transitions/zoom-out effect
		//	MW_properties.global.partialView.height = 70;
		//	MW_methods.resizePartialScannerView(MW_properties, Dynamic_DOM_Elements);
		//}, 5000);
		if (mwb_debug_print) console.log('final');
		// register an event listener to be notified and execute resizeCanvas upon window resize for desktop only AND orientation->UI change for phone/tablet
		};
		
		//promise here
		//call create
		try {
			
			await Dynamic_DOM_Elements.main_createPreview(MW_properties, MW_methods);
			
			//var timePoll = 0; //global
			//var callCount = 0;
			
			//TEST
			/*
			var poll_PreviewFrame = setInterval(function () {
				//processing
				callCount++;
				timePoll += 4;
				if (timePoll == 100) { clearInterval(poll_PreviewFrame); timePoll = 0; callCount = 0; return; }
				
				if (mwb_debug_print) console.log('previewFrame after ' + timePoll);
				if (mwb_debug_print) console.log([Dynamic_DOM_Elements.previewFrame.offsetLeft,
				Dynamic_DOM_Elements.previewFrame.offsetTop,
				Dynamic_DOM_Elements.previewFrame.offsetWidth,
				Dynamic_DOM_Elements.previewFrame.offsetHeight]);
			}, 4);*/
			
			await JavaScript_mediaDevices_API.init_values(Dynamic_DOM_Elements.preview, after_VideoLoadedData, function(){});
			
			//anyways, figured out and fixed two mysteries - use "key": in json (getScanRects), and use MWOv.lines after they've been init-ed
		} catch(error) {
			//handle errro
		}
		
		return 0;		
	},
	
	set_DecoderTimeout: function (timeout) {
		
		var timeout1 = ((typeof timeout === 'number') && (timeout >= 10 && timeout <= 60)) ? timeout : 30; //these mix, max, default values should be taken from gui_demo_controls (prev set there)
		
		MWBScanner.decoder_timeout = timeout1;
	},
	
	set_DpsLimit: function (dps_limit) {
		
		var dps_limit1 = ((typeof dps_limit === 'number') && (dps_limit >= 1 && dps_limit <= 30)) ? dps_limit : 30; //these mix, max, default values should be taken from gui_demo_controls (prev set there)
		
		MWBScanner.dps_limit = dps_limit1;
	},
	
	set_Continuous: function (continuous) {
		
		if (!(typeof continuous === 'boolean')) { if (mwb_debug_print) console.log('error: boolean argument required for arg in set_Continuous'); return; }
		
		MWBScanner.CONTINUOUS_DECODING = continuous;
	},
	
	set_Parsing: function (use_parser) {
		
		if (!(typeof use_parser === 'boolean')) { if (mwb_debug_print) console.log('error: boolean argument required for arg in set_Parsing'); return; }
		
		if (use_parser) BarcodeScanner.MWBsetActiveParser(0xFF);
		else BarcodeScanner.MWBsetActiveParser(0x0); //or actual masks aka _NONE
		
		//How do I test if parsing took place? THIS - add it ↓ there, use it here
		//When all could have been resolved with a simple boolean indicator in the json result.
		
		MWBScanner.USE_PARSER = use_parser;
	},
	
	set_Pause: function (pause) {
		
		if (!(typeof pause === 'boolean')) { if (mwb_debug_print) console.log('error: boolean argument required for arg in set_Pause'); return; }
		
		MWBScanner.PAUSE_DECODING = pause;
	},
	
	set_Preview_anchor: function (orientation) {
		
		var anchor_to = ((typeof orientation === 'number') && (orientation >= 0 && orientation <= 3)) ? orientation : 0;
		
		if (!MWBScanner.DECODER_ACTIVE) //might need a scanner_running/active/started flag instead
		MW_properties.global.partialView.orientation = anchor_to; //0 for none, subsequent values - 1 for respective orientation
	},
	
	resizePreview: function (x, y, w, h) { //(x, y, width, height)
		
		var x1 = ((typeof x === 'number') && (x >= 0 && x <= 100)) ? x : MW_properties.global.partialView.x;
        var y1 = ((typeof y === 'number') && (y >= 0 && y <= 100)) ? y : MW_properties.global.partialView.y;
        var w1 = ((typeof w === 'number') && (w >= 0 && w <= 100)) ? w : MW_properties.global.partialView.width;
        var h1 = ((typeof h === 'number') && (h >= 0 && h <= 100)) ? h : MW_properties.global.partialView.height;
		
		if (mwb_debug_print) console.log("RESIZE: " + [x1, y1, w1, h1]);
		
		MW_properties.global.partialView.x = x1;
		MW_properties.global.partialView.y = y1;
		MW_properties.global.partialView.width = w1; //this can also be wrapped for fullscreen, and for transitions/zoom-out effect
		MW_properties.global.partialView.height = h1;
		
		if (MWBScanner.DECODER_ACTIVE) //might need a scanner_running/active/started flag instead
		MW_methods.resizePartialScannerView(MW_properties, Dynamic_DOM_Elements);
	},
	
	destroyPreview: async function (has_res) {
		
		//clean up the get out of FS thing
		//document.removeEventListener('backbutton', function(){MWBScanner.destroyPreview()}, false);
		
		const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
		
		var this_root = JavaScript_mediaDevices_API;
		var track = this_root.videoTrack;
		Dynamic_DOM_Elements.destroyPreview(this_root, track); //not truly awaitable at this point
		
		//complete empty callback
		await wait(128);
		if (typeof has_res == "undefined")
		if (MWBScanner.result_callback) //return to callback!
			MWBScanner.result_callback(
				{
					code: "",
					type: "Cancel",
					isGS1: null,
					bytes: null,
					location: null,
					imageWidth: null,
					imageHeight: null
				}
			);
		
		//MWBScanner.external_helper(MWBScanner.DECODER_ACTIVE); //gui
	},
	
	gui_demo_controls: [],
	gui_demo_controls_Array: [], //[] for- for example, to disable all (fade)
	
	gui_demo: {
		//		
		generateCustomToggleControl: function (id, text1_label, text2_values, initial_state, switch_handler) {
			//			
			var div_wrapper = document.createElement('div');
			
			var span_label = document.createElement('span');
			const whiteSpace = "    ";
			span_label.id = id + "_text1";
			span_label.innerHTML = text1_label + whiteSpace;
			
			var label_holder = document.createElement('label');
			label_holder.id = id + "_holder";
			label_holder.className = "switch";
			
			var input_checkbox = document.createElement('input');
			input_checkbox.id = id;
			input_checkbox.type = "checkbox";
			input_checkbox.checked = initial_state;
			
			var span_slider = document.createElement('span');
			span_slider.className = "slider round";
			
			var span_value = document.createElement('span');
			span_value.id = id + "_text2";
			span_value.innerHTML = text2_values[Number(initial_state)];
			
			
			function myToggle() {
				
				MWBScanner.gui_demo_controls[this.id].value = this.checked;
				
				var id = this.dataset.id;
				var text2_values = MWBScanner.gui_demo_controls[id].text2_values;
				var toggle = this; //.checked //document.getElementById(id)
				var toggle_text2 = document.getElementById(id + "_text2");
								
				//if (toggle.checked) toggle_text2.innerHTML = "HD 720p";
				//else toggle_text2.innerHTML = "SD 480p";
				
				toggle_text2.innerHTML = text2_values[Number(toggle.checked)];
				
				//first the above code will execute, then the GUI will change
				
				switch_handler();
			}			
			
			
			label_holder.appendChild(input_checkbox);
			label_holder.appendChild(span_slider);
			
			div_wrapper.appendChild(span_label);
			div_wrapper.appendChild(label_holder);
			div_wrapper.appendChild(span_value);
			
			input_checkbox.dataset.id = id; //custom data-*
			
			var custom_object = { id: id, element_ref: div_wrapper, text2_values: text2_values, event_handler: myToggle, disable_element: null, value: initial_state };
			
			input_checkbox.onclick = custom_object.event_handler;
			
			//will init work for dynamic dom elements? -y.
			
			label_holder.style.position = "absolute";
			span_value.style.position = "absolute";
			
			label_holder.style.marginTop = "-5px";
			span_value.style.marginLeft = "80px";
			span_value.style.color = "#7f7f7f";
			
			custom_object.disable_element = function (disable, hide) {
				//
				var id = this.id;
				var toggle = document.getElementById(id); //.checked
				var toggle_holder = document.getElementById(id + "_holder");
				var toggle_text1 = document.getElementById(id + "_text1");
				var toggle_text2 = document.getElementById(id + "_text2");
				
				if (disable)
				{
					toggle_holder.style.opacity = "0.5"; //use the holder
					toggle.disabled = true;
				}
				else
				{
					toggle.disabled = false;
					toggle_holder.style.opacity = "1.0"; //use the holder
				}
				
				if (typeof hide === 'boolean')
				{
					let show = !hide;
					toggle_holder.style.opacity = (show) ? ((disable) ? "0.5" : "1.0") : "0.0";
				}
				
			};
			
			document.body.appendChild(div_wrapper);
			
			MWBScanner.gui_demo_controls[id] = custom_object;
			MWBScanner.gui_demo_controls_Array.push(MWBScanner.gui_demo_controls[id]); 
		},
		
		//NOTE: select_values is used in place of text2_values and will be placed inside the select's options
		generateCustomSelectControl: function (id, text1_label, select_values, initial_state, change_handler) {
			//			
			var div_wrapper = document.createElement('div');
			
			var span_label = document.createElement('span');
			const whiteSpace = "    ";
			span_label.id = id + "_text1";
			span_label.innerHTML = text1_label + whiteSpace;
			
			//actual select
			var div_holder = document.createElement('div');
			div_holder.className = "custom-select";
			div_holder.style.width = "220px";
			
			var main_select = document.createElement('select');
			main_select.id = id;
			
			//check if array?
			const optionsCount = select_values.length; // The length property returns the number of elements
			
			for(let i = 0; i < optionsCount; i++)
			{
				var option_i = document.createElement('option');
				option_i.value = i;
				option_i.innerHTML = select_values[i];
				main_select.appendChild(option_i);
			}			
			main_select.value = Number(initial_state); //set this After options have been added
			
			div_holder.appendChild(main_select);
			//end of actual select			
			
			//var span_value = document.createElement('span');
			//span_value.id = id + "_text2";
			//span_value.innerHTML = text2_values[Number(initial_state)];
			
			
			//function handler
			function mySelect()
			{
				MWBScanner.gui_demo_controls[this.id].value = this.value; //update value
				
				change_handler(); //this should take the value above, which should be the mask
			}			
			
			div_wrapper.appendChild(span_label);
			div_wrapper.appendChild(div_holder);
			//div_wrapper.appendChild(span_value);
			
			var custom_object = { id: id, element_ref: div_wrapper, text2_values: select_values, event_handler: mySelect, disable_element: null, value: initial_state };
			
			main_select.onchange = custom_object.event_handler;
			
			//div_holder.style.position = "absolute"; //see for different positions of div_wrapper
			//span_value.style.position = "absolute";
			
			div_holder.style.marginTop = "-35px";
			div_holder.style.marginLeft = Math.round((text1_label.length + 4) * 10) + "px";
			//span_value.style.marginLeft = "100px";
			//span_value.style.color = "#7f7f7f";
			
			//custom_object.disable_element = function (disable) {
			
			document.body.appendChild(div_wrapper);
			
			MWBScanner.gui_demo_controls[id] = custom_object;
			MWBScanner.gui_demo_controls_Array.push(MWBScanner.gui_demo_controls[id]);
		},
		
		//all selects
		init_customSelects: function () {
			//
			var x, i, j, selElmnt, a, b, c;

			/*look for any elements with the class "custom-select":*/
			x = document.getElementsByClassName("custom-select");
			
			function closeAllSelect(elmnt) {
				//if (mwb_debug_print) console.log("pazi mori 2");
				/*a function that will close all select boxes in the document,
				except the current select box:*/
				var x, y, i, arrNo = [];
				x = document.getElementsByClassName("select-items");//if (mwb_debug_print) console.log(x);
				y = document.getElementsByClassName("select-selected");//if (mwb_debug_print) console.log(y);
				for (i = 0; i < y.length; i++) {
					if (elmnt == y[i]) {
						arrNo.push(i)
					} else {
						y[i].classList.remove("select-arrow-active");
					}
				}
				for (i = 0; i < x.length; i++) {
					if (arrNo.indexOf(i)) {
						x[i].classList.add("select-hide");
					}
				}
			}

			for (i = 0; i < x.length; i++) {
				
				selElmnt = x[i].getElementsByTagName("select")[0];
				
				/*for each element, create a new DIV that will act as the selected item:*/
				a = document.createElement("DIV");
				a.dataset.id = selElmnt.id; //custom data-* //to serve as ref to parent select later on click
				a.setAttribute("class", "select-selected");
				a.innerHTML = selElmnt.options[selElmnt.selectedIndex].innerHTML;
				x[i].appendChild(a);
				
				/*for each element, create a new DIV that will contain the option list:*/
				b = document.createElement("DIV");
				b.setAttribute("class", "select-items select-hide");
				
				for (j = 1; j < selElmnt.length; j++) {
					
					/*for each option in the original select element,
					create a new DIV that will act as an option item:*/
					c = document.createElement("DIV");
					c.innerHTML = selElmnt.options[j].innerHTML;
					c.addEventListener("click", function(e) {
						
						/*when an item is clicked, update the original select box,
						and the selected item:*/
						var i, s, h;
						s = this.parentNode.parentNode.getElementsByTagName("select")[0];
						h = this.parentNode.previousSibling;
						
						for (i = 0; i < s.length; i++) {
							
							if (s.options[i].innerHTML == this.innerHTML) {
								s.selectedIndex = i;
								h.innerHTML = this.innerHTML;
								break;
							}
						}
						h.click();
					});
					b.appendChild(c);
				}
				x[i].appendChild(b);
				a.addEventListener("click", function(e) {
					
					/*when the select box is clicked, close any other select boxes,
					and open/close the current select box:*/
					e.stopPropagation();
					closeAllSelect(this);
					this.nextSibling.classList.toggle("select-hide");
					this.classList.toggle("select-arrow-active");
					
					let parent_select = document.getElementById(this.dataset.id);
					let prev_value = MWBScanner.gui_demo_controls[parent_select.id].value;
					
					//but is value actually changed? we need previous to compare (stored in custom object)
					if (parent_select.value != prev_value) parent_select.onchange();
				});
			}
			
			/*if the user goes anywhere outside the select box,
			then close all select boxes:*/
			document.addEventListener("click", closeAllSelect); //onfocusout works, you just have to set it for the right element|(s)
		},
		
		//NOTE: initial_states is used in place of initial_state and is an array for the initial state of each checkbox
		//multiple checkboxes can be created - only 1 text1_label for 1+ text2_values/initial_states
		//change_handler should handle changes from all checkboxes
		//checkboxes are id'd by _0x_i, where i is the index from the array text2_values
		generateCustomCheckboxesControl: function (id, text1_label, text2_values, initial_states, change_handler) {
			//
			//verify aRRays beforehand?
			var div_wrapper = document.createElement('div');
			div_wrapper.style.width = "90%"; //here
			//this is just a root-parent, but if you need to make it a table:
			//div_wrapper.style.border = "1px solid black";
			//div_wrapper.style.display = "table";
			//div_wrapper.style.tableLayout = "fixed";
			
			var span_label = document.createElement('span');
			const whiteSpace = "    ";
			span_label.id = id + "_text1";
			span_label.innerHTML = text1_label + whiteSpace;
			
			var span_padding_workaround = document.createElement('span');
			span_padding_workaround.innerHTML = whiteSpace;
			span_padding_workaround.style.display = "block";
			span_padding_workaround.style.fontSize = "8px";
			
			div_wrapper.appendChild(span_label);
			div_wrapper.appendChild(span_padding_workaround);
			
			//function handler
			function myCheckboxes()
			{
				let control_IDs = this.id.split("_0x_"); //or lastIndexOf
				let group_id =  control_IDs[0];
				let checkbox_id =  control_IDs[1];
				
				MWBScanner.gui_demo_controls[group_id].value[checkbox_id] = this.checked; //update value
				
				//this.id is id + '_' + i, where i is the index from the array text2_values
				//you could also use .dataset.custom_mask or something like that
				
				//test
				//alert(this.checked);
				
				change_handler(); //this should take the value above, which should be the mask
			}
			
			//check if array?
			const checkboxesCount = text2_values.length; // The length property returns the number of elements
			const numberOfColumns = 3; //could be changed to 4 for portrait, but that would involve re-caling all of this
			const checkboxesPerColumn = Math.ceil(checkboxesCount / numberOfColumns);
			
			var div_column_wrapper = document.createElement('div');
			div_column_wrapper.style.width = "100%"; //here
			//div_column_wrapper.style.border = "2px solid black";
			div_column_wrapper.style.display = "table";
			div_column_wrapper.style.tableLayout = "fixed";
			
			var div_columns_Array = [];
			
			for(let j = 0; j < numberOfColumns; j++)
			{
				//
				var div_column = document.createElement('div');
				div_column.style.width = "50%"; //here
				//div_column.style.border = "1px solid black";
				div_column.style.display = "table-cell";
				
				div_columns_Array.push(div_column);
				div_column_wrapper.appendChild(div_columns_Array[j]);
			}
			
			//if (mwb_debug_print) console.log(div_columns_Array);
			let j = 0;
			let column_ref = div_columns_Array[j];
			
			for(let i = 0; i < checkboxesCount; i++)
			{
				//actual checkboxes
				var label_holder = document.createElement('label');
				label_holder.id = id + "_holder";
				label_holder.className = "container";
				label_holder.innerHTML = text2_values[i]; //this element serves as span_value
				
				var input_checkbox = document.createElement('input');
				input_checkbox.id = id + '_0x_' + i; //conversion should be as expected
				input_checkbox.type = "checkbox";
				input_checkbox.checked = initial_states[i];
				input_checkbox.onchange = myCheckboxes;
				
				var span_mark = document.createElement('span');
				span_mark.className = "checkmark";
				
				label_holder.appendChild(input_checkbox);
				label_holder.appendChild(span_mark);
				
				//var span_value = document.createElement('span');
				//span_value.id = id + "_text2";
				//span_value.innerHTML = text2_values[Number(initial_state)];
				
				//div_wrapper.appendChild(label_holder); //all checkboxes in one parent div
				
				if ((checkboxesPerColumn / (i - (checkboxesPerColumn * j))) <= 1.0) j++;
				
				//if (mwb_debug_print) console.log('i and j: ' + i + ' ' + j); //dev test
				
				div_columns_Array[j].appendChild(label_holder);
			}
			
			div_wrapper.appendChild(div_column_wrapper);
			//if (mwb_debug_print) console.log('sound ost');
			var custom_object = { id: id, element_ref: div_wrapper, text2_values: text2_values, event_handler: myCheckboxes, disable_element: null, value: initial_states }; //value is an array here
			
			//no need to use margins?
			//nothing works as needed with span_label
			
			//custom_object.disable_element = function (disable) {
			
			document.body.appendChild(div_wrapper);
			
			MWBScanner.gui_demo_controls[id] = custom_object;
			MWBScanner.gui_demo_controls_Array.push(MWBScanner.gui_demo_controls[id]);
		},
		
		//NOTE: text2_values is replaced with range_values, which serve as [[min, max], ...] array of arrays for 1 or multiple range sliders
		//initial_states is an array for 1 or multiple range sliders
		generateCustomRangeSliderControl: function (id, text1_label, range_values, initial_states, change_handler) {
			//			
			var div_wrapper = document.createElement('div');
			
			var span_label = document.createElement('span');
			const whiteSpace = "    ";
			span_label.id = id + "_text1";			
			//span_label.innerHTML = text1_label + ": " + initial_states[0] + whiteSpace; //later
			
			var text1_label_Values = "";
			
			var div_holder = document.createElement('div');
			div_holder.id = id + "_holder";
			div_holder.className = "slidecontainer";
			
			function myRange() {
				
				let control_IDs = this.id.split("_0x_"); //or lastIndexOf
				let group_id =  control_IDs[0];
				let range_id =  control_IDs[1];
				
				MWBScanner.gui_demo_controls[group_id].value[range_id] = Number(this.value); //update value (for some reason originally its a string, nothing a little conversion can't fix)
				
				var id = this.dataset.id;
				var rangeSlider_text1 = document.getElementById(id + "_text1");
				
				const whiteSpace = "    ";
				let label = rangeSlider_text1.innerHTML;
				
				var rangeSlidersCount = MWBScanner.gui_demo_controls[group_id].value.length;
				
				if (rangeSlidersCount == 1)
				{
					let delimPos = label.lastIndexOf(": ");
				
					label = label.substring(0, delimPos) + ": " + this.value + whiteSpace; //label.substring(delimPos, dateString.length);
				}
				else
				{
					//4
					if (rangeSlidersCount == 4)
					{
						let delimPos = label.lastIndexOf("→ (");
						
						//Perform a global replacement:
						//str.replace(/blue/g, "red");
						let values = MWBScanner.gui_demo_controls[group_id].value + "";
						values = values.replace(/,/g, ", ");
						
						label = label.substring(0, delimPos) + "→ (" + values + ")" + whiteSpace;
					}
				}
				
				rangeSlider_text1.innerHTML = label;
				
				//first the above code will execute, then the GUI will change
				
				change_handler();
			}
			
			//check if array? and both?
			const rangeSlidersCount = range_values.length;
			
			for(let i = 0; i < rangeSlidersCount; i++)
			{
				var span_padding_workaround = document.createElement('span');
				span_padding_workaround.innerHTML = whiteSpace;
				span_padding_workaround.style.display = "block";
				span_padding_workaround.style.fontSize = "6px";
				
				var input_range = document.createElement('input');
				input_range.id = id + '_0x_' + i;
				input_range.type = "range";
				input_range.min = range_values[i][0];
				input_range.max = range_values[i][1];
				input_range.value = initial_states[i];
				input_range.className = "slider_range";
				
				input_range.dataset.id = id; //custom data-*
				input_range.oninput = myRange;
				
				text1_label_Values += initial_states[i] + ", ";
				
				//var span_value = document.createElement('span'); //inside div_holder |change: span_label will be used
				//span_value.id = id + "_text2";
				//span_value.innerHTML = initial_states[i];
				
				div_holder.appendChild(span_padding_workaround);
				div_holder.appendChild(input_range);
				//div_holder.appendChild(span_value); //span_label will be used
			}
			
			if (rangeSlidersCount == 1)
			{
				text1_label_Values = text1_label_Values.substring(0, text1_label_Values.length - 2);
				span_label.innerHTML = text1_label + ": " + text1_label_Values + whiteSpace;
			}
			else
			{
				text1_label_Values = text1_label_Values.substring(0, text1_label_Values.length - 2);
				span_label.innerHTML = text1_label + " → (" + text1_label_Values + ")" + whiteSpace;
			}	
			
			div_wrapper.appendChild(span_label);
			div_wrapper.appendChild(div_holder);
			//div_wrapper.appendChild(span_value); //already done inside div_holder
			
			
			var custom_object = { id: id, element_ref: div_wrapper, text2_values: range_values, event_handler: myRange, disable_element: null, value: initial_states }; //finish here, make it work fully
			
			
			//will init work for dynamic dom elements? -y.
			
			//label_holder.style.position = "absolute";
			//span_value.style.position = "absolute";
			//
			//label_holder.style.marginTop = "-5px";
			//span_value.style.marginLeft = "100px";
			//span_value.style.color = "#7f7f7f";
			
			custom_object.disable_element = function (disable) {
				//
				//var id = this.id;
				//var toggle = document.getElementById(id); //.checked
				//var toggle_holder = document.getElementById(id + "_holder");
				//var toggle_text1 = document.getElementById(id + "_text1");
				//var toggle_text2 = document.getElementById(id + "_text2");
				//
				//if (disable)
				//{
				//	toggle_holder.style.opacity = "0.5"; //use the holder
				//	toggle.disabled = true;
				//}
				//else
				//{
				//	toggle.disabled = false;
				//	toggle_holder.style.opacity = "1.0"; //use the holder
				//}
			};
			
			document.body.appendChild(div_wrapper);
			
			MWBScanner.gui_demo_controls[id] = custom_object;
			MWBScanner.gui_demo_controls_Array.push(MWBScanner.gui_demo_controls[id]);
		}
	}
};