/*
*	USAGE: INCLUDE WITH  <script type="text/javascript" src="js/MWBConfig_wa.js"></script> in your index.html
*/
var scannerConfig = function(){
	
	let mwb_debug_print = false;	
	if (mwb_debug_print) console.log('scannerConfig called');
	if (mwb_debug_print) console.log(mwbScanner);
	
	//Add an event listener
	document.addEventListener("scannerModuleLoaded", function(e) {
		
		console.log(e.detail); //Prints "Scanner is ready."
		
		//can use mwbScanner.* methods now
	});
	
	
	/**
	* result.code - string representation of barcode result
	* result.parsedCode - string json representation of parsed barcode result (if any)
	* result.type - type of barcode detected or 'Cancel' if scanning is canceled
	* result.bytes - bytes array of raw barcode result
	* result.isGS1 - (boolean) barcode is GS1 compliant
	* result.location - contains rectangle points p1,p2,p3,p4 with the corresponding x,y
	* result.imageWidth - Width of the scanned image
	* result.imageHeight - Height of the scanned image
	*/
	
	//Here we have a straight forward callback that just alerts the value.
	//This callback will be set as default and mwbScanner.startScanner can be called without inline callbacks
	//However users still have the option to not even use setCallback, and set a callback function directly passed as parameter to mwbScanner.startScanner
    mwbScanner.setCallback(
		function (result) {
		
			if (result.type == "Cancel") console.log("No Barcode.");
			else alert(result.type + '\n' + result.code);
		
			//mwbScanner.resumeScanning(); //if using !MWBcloseScannerOnDecode
		}
	);
	
	mwbScanner.setIcon("wasm_license_20334.png");

    // Some predefined settings, comment out the ones you don't want enabled
    var mw_c = mwbScanner.getConstants(),
	settings = [
		{"method" : "MWBsetActiveCodes", "value" : [
			mw_c.MWB_CODE_MASK_QR | 
			mw_c.MWB_CODE_MASK_DM | 
			//mw_c.MWB_CODE_MASK_RSS | 
			//mw_c.MWB_CODE_MASK_39 | 
			mw_c.MWB_CODE_MASK_EANUPC | 
			mw_c.MWB_CODE_MASK_128 | 
			mw_c.MWB_CODE_MASK_PDF | 
			//mw_c.MWB_CODE_MASK_AZTEC | 
			//mw_c.MWB_CODE_MASK_25 | 
			//mw_c.MWB_CODE_MASK_93 | 
			//mw_c.MWB_CODE_MASK_CODABAR | 
			//mw_c.MWB_CODE_MASK_DOTCODE | 
			//mw_c.MWB_CODE_MASK_11 | 
			//mw_c.MWB_CODE_MASK_MSI | 
			//mw_c.MWB_CODE_MASK_MAXICODE | 
			//mw_c.MWB_CODE_MASK_POSTAL |
			//mw_c.MWB_CODE_MASK_TELEPEN |
			0x0 //for binary-OR syntax purposes
		]}
		,{"method" : "MWBsetLevel", "value" : [2]} //3 will try to scan harder than the default which is 2
		,{"method" : "MWBsetActiveParser", "value" : [mw_c.MWP_PARSER_MASK_NONE]}
		//,{"method" : "MWBenableFlash", "value" : [true]}
		//,{"method" : "MWBenableZoom", "value" : [true]}
		//,{"method" : "MWBsetOverlayMode", "value" : [mw_c.OverlayModeImage]}
		//,{"method" : "MWBsetBlinkingLineVisible", "value" : [true]}
		//,{"method" : "MWBsetPauseMode", "value" : [mw_c.PM_STOP_BLINKING]}
		//,{"method" : "MWBusePartialScanner", "value" : [false]}
		//,{"method" : "MWBenableHiRes", "value" : [true]}
		//,{"method" : "MWBuseFrontCamera", "value" : [false]}
		//,{"method" : "MWBcloseScannerOnDecode", "value" : [false]}
		,{"method" : "MWBsetDecoderTimeout", "value" : [30]} //10-60
		,{"method" : "MWBsetDpsLimit", "value" : [2]} //1-30
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_25, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_39, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_93, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_128, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_AZTEC, 20, 2, 60, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_DM, 20, 2, 60, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_EANUPC, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_PDF, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_QR, 20, 2, 60, 96]} //for some reason decoding QR codes is harder when the code fills up the viewfinder
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_RSS, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_CODABAR, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_DOTCODE, 30, 20, 40, 60]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_11, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_MSI, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_MAXICODE, 20, 2, 60, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_POSTAL, 2, 2, 96, 96]}
		//,{"method" : "MWBsetScanningRect", "value" : [mw_c.MWB_CODE_MASK_TELEPEN, 2, 2, 96, 96]}
		//,{"method" : "MWBsetMinLength", "value" : [mw_c.MWB_CODE_MASK_25, 5]}
		//,{"method" : "MWBsetMinLength", "value" : [mw_c.MWB_CODE_MASK_39, 5]}
		//,{"method" : "MWBsetMinLength", "value" : [mw_c.MWB_CODE_MASK_MSI, 5]}
		//,{"method" : "MWBsetMinLength", "value" : [mw_c.MWB_CODE_MASK_CODABAR, 5]}
		//,{"method" : "MWBsetMinLength", "value" : [mw_c.MWB_CODE_MASK_11, 5]}
		//,{"method" : 'MWBsetDirection', "value" : [mw_c.MWB_SCANDIRECTION_VERTICAL | mw_c.MWB_SCANDIRECTION_HORIZONTAL]}
	];
		
	return mwbScanner.loadSettings(settings)
				.then(function(response){
					if (mwb_debug_print) console.log(response); //the response is the settings array
				})
				.catch(function(reason){
					if (mwb_debug_print) console.log(reason)
				});
}
var setWasmPath = function(){
	return "index.wasm";
}