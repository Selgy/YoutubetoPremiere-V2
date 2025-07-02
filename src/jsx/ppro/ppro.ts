import {
  helloVoid,
  helloError,
  helloStr,
  helloNum,
  helloArrayStr,
  helloObj,
} from "../utils/samples";
export { helloError, helloStr, helloNum, helloArrayStr, helloObj, helloVoid };
import { dispatchTS } from "../utils/utils";

export const qeDomFunction = () => {
  if (typeof qe === "undefined") {
    app.enableQE();
  }
  if (qe) {
    qe.name;
    qe.project.getVideoEffectByName("test");
  }
};

export const helloWorld = () => {
  alert("Hello from Premiere Pro.");
};

// Extend the $ type to include our custom _ext namespace
declare global {
  interface $ {
    _ext?: {
      importVideoToSource?: (videoPath: string) => any;
    };
  }
}

// Import video function that delegates to the ExtendScript function loaded from importVideo.jsx
export const importVideoToSource = (videoPath: string) => {
  try {
    // Check if the ExtendScript function exists
    //@ts-ignore - ExtendScript global $ object
    if (typeof $._ext === 'undefined' || typeof $._ext.importVideoToSource !== 'function') {
      return JSON.stringify({
        success: false,
        error: "ExtendScript importVideoToSource function not available",
        path: videoPath
      });
    }
    
    // Call the ExtendScript function
    //@ts-ignore - ExtendScript global $ object
    const result = $._ext.importVideoToSource(videoPath);
    return JSON.stringify(result);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: String(error),
      path: videoPath
    });
  }
};
