  //<<<<<<<<<<<<<<>>>>>>>>>>>>>
  //----
  //exporting API methods:
  //var Scanner = function(){ var self = this; } //Scanner already exists from MWBScanner_wa.js
  var mwbScanner = null;
  mwbScanner = new Scanner(); //if you don't do this (like, have it commented) nothing works and no error is thrown
  
  var wasmPath = (typeof setWasmPath == "function") ? setWasmPath() : "index.wasm";
  
  var module_loaded = false;
  
  // Create the event
  var scanner_event = new CustomEvent("scannerModuleLoaded", { "detail": "Scanner is ready." });
  //-----
  var Module = {
	wasmBinaryFile: wasmPath || "index.wasm",
	preRun: [],
	postRun: [],
	print: (function() {
		  return function(text) {
			  //-------------
			  if (module_loaded) return;
			  //Wrapped native API methods:
				if (mwb_debug_print) console.log(text); module_loaded = true;
				
				//Configure Common Scanner Parameters/Settings GROUP
				BarcodeScanner.MWBinitDecoder	 	= mwbScanner.generateMethod('cfg_', 'MWBinitDecoder');
				BarcodeScanner.MWBsetActiveCodes 	= mwbScanner.generateMethod('cfg_', 'MWBsetActiveCodes');
				BarcodeScanner.MWBgetActiveCodes 	= mwbScanner.generateMethod('cfg_', 'MWBgetActiveCodes'); //internal use only
				BarcodeScanner.MWBsetLevel 			= mwbScanner.generateMethod('cfg_', 'MWBsetLevel');
				BarcodeScanner.MWBsetActiveParser 	= mwbScanner.generateMethod('cfg_', 'MWBsetActiveParser');
				
				//Configure Advanced Scanner Parameters/Settings GROUP
				BarcodeScanner.MWBsetActiveSubcodes = mwbScanner.generateMethod('acfg_', 'MWBsetActiveSubcodes');
				BarcodeScanner.MWBsetFlags 			= mwbScanner.generateMethod('acfg_', 'MWBsetFlags');
				BarcodeScanner.MWBsetMinLength 		= mwbScanner.generateMethod('acfg_', 'MWBsetMinLength');
				BarcodeScanner.MWBsetDirection 		= mwbScanner.generateMethod('acfg_', 'MWBsetDirection');
				BarcodeScanner.MWBsetScanningRect 	= mwbScanner.generateMethod('acfg_', 'MWBsetScanningRect');
				BarcodeScanner.MWBgetScanningRect 	= Module.cwrap('acfg_MWBgetScanningRect', 'string', ['number']); //internal use only
				BarcodeScanner.MWBsetParam 			= mwbScanner.generateMethod('acfg_', 'MWBsetParam');
				
				BarcodeScanner.MWBduplicateCodeDelay = mwbScanner.generateMethod('acfg_', 'MWBsetDuplicatesTimeout'); //is in C++ ? -It is now.
				//wow, this worked better than expected
				
				const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
				//await wait(1);
				
				scannerConfig(); //notification that scanner is ready can be sent here
				
				if (mwb_debug_print) console.log('back home'); //this point is never reach when async start is called above |(tho in .html sdk_mod has no async) ---strikethrough---
				//since then, this point is infact reached, at some later time while mediaStream inits, and this behaviour is consistent even if await is used
				
				
				//API methods assigned with cwrap don't book-keep or have an easy wrapper
				
				//also those methods make direct sdk calls, which might be a problem
				//if done while the decoder is running
				//but because its single threaded that can't happen
				
				// Dispatch/Trigger/Fire the event
				document.dispatchEvent(scanner_event);
	};
	})()
  };