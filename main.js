const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const nodeID3 = require("node-id3");

let mainWindow;

/**
 * Creates a new browser window with specified dimensions and web preferences.
 * The window loads the 'index.html' file.
 *
 * @function
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
}

app.on("ready", createWindow);

// Handle folder selection
ipcMain.handle("select-folder", async () => {
  /**
   * Opens a dialog for the user to select a directory.
   *
   * @param {BrowserWindow} mainWindow - The main application window.
   * @returns {Promise<Electron.OpenDialogReturnValue>} - A promise that resolves with the result of the dialog.
   */
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.filePaths[0]; // Return the selected folder path
});

// Handle metadata reading from folder using dynamic import
ipcMain.handle("scan-folder", async (event, folderPath) => {
  const files = fs.readdirSync(folderPath);
  /**
   * Filters the list of files to include only MP3 files.
   *
   * @constant {Array<string>} mp3Files - An array of filenames with the .mp3 extension.
   */
  const mp3Files = files.filter((file) => path.extname(file) === ".mp3");

  let metadataList = [];

  // Use dynamic import for music-metadata
  const { parseFile } = await import("music-metadata");

  for (const file of mp3Files) {
    const filePath = path.join(folderPath, file);
    try {
      const metadata = await parseFile(filePath);
      metadataList.push({ file, metadata: metadata.common });
    } catch (error) {
      metadataList.push({ file, error: error.message });
    }
  }
  return metadataList;
});

// Recursive function to validate tags and remove invalid data
/**
 * Recursively validates and removes invalid tags from the provided tags object.
 *
 * This function iterates over each property in the tags object and performs the following checks:
 * - If the value is null, undefined, an empty string, or an empty array, the tag is removed.
 * - If the value is an object, it recursively validates its properties.
 * - If the value is an array of objects, it validates each element in the array.
 * - After validation, if an object is empty, the tag is removed.
 *
 * @param {Object} tags - The tags object to be validated and cleaned.
 */
function deepValidateTags(tags) {
  Object.keys(tags).forEach((tag) => {
    const value = tags[tag];

    // If the value is null, undefined, or an empty string, remove the tag
    if (
      value === null ||
      value === undefined ||
      value === "" ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete tags[tag];
      console.log(`Removed invalid tag: ${tag}`);

      // If the value is an object, recursively validate its properties
    } else if (typeof value === "object") {
      if (isObjectArray(value)) {
        // If it's an array of objects, validate each element
        value.forEach((subValue) => deepValidateTags(subValue));
      } else {
        // If it's an object, validate its properties
        deepValidateTags(value);
      }

      // After validation, if the object is empty, remove the tag
      if (Object.keys(tags[tag]).length === 0) {
        delete tags[tag];
        console.log(`Removed empty object tag: ${tag}`);
      }
    }
  });
}

// Enhanced recursive function to remove text from tags, handling nested arrays and objects
/**
 * Removes specified text from the values of the given tags object.
 * Handles string values, arrays, and nested objects recursively.
 *
 * @param {Object} tags - The object containing tags with values to be processed.
 * @param {string} textToRemove - The text to be removed from the tag values.
 */
function removeTextFromTags(tags, textToRemove) {
  Object.keys(tags).forEach((tag) => {
    const value = tags[tag];

    // Handle string values
    if (typeof value === "string" && value.includes(textToRemove)) {
      tags[tag] = value.replace(textToRemove, "");
      console.log(`Removed "${textToRemove}" from ${tag}`);

      // Handle array values
    } else if (Array.isArray(value)) {
      value.forEach((element, index) => {
        if (typeof element === "string" && element.includes(textToRemove)) {
          value[index] = element.replace(textToRemove, "");
          console.log(`Removed "${textToRemove}" from array at index ${index}`);
        } else if (typeof element === "object" && element !== null) {
          // Recursively handle objects inside arrays
          removeTextFromTags(element, textToRemove);
        }
      });

      // Handle nested objects
    } else if (typeof value === "object" && value !== null) {
      removeTextFromTags(value, textToRemove); // Recursively remove text from nested objects
    }
  });
}

// Helper function to check if an object is an array of objects
/**
 * Checks if the input is an array where every element is a non-null object.
 *
 * @param {any} input - The input to check.
 * @returns {boolean} - Returns true if the input is an array of non-null objects, otherwise false.
 */
function isObjectArray(input) {
  if (Array.isArray(input)) {
    return input.every((item) => typeof item === "object" && item !== null);
  }
  return false;
}

// Handle text removal from metadata
ipcMain.handle("remove-text", (event, filePath, textToRemove) => {
  /**
   * Reads the ID3 tags from the specified file.
   *
   * @param {string} filePath - The path to the file from which to read the ID3 tags.
   * @returns {Object} The ID3 tags of the file.
   */
  let tags = nodeID3.read(filePath);

  if (!tags) {
    console.error(`Failed to read tags from file: ${filePath}`);
    return `Failed to read tags from ${path.basename(filePath)}`;
  }

  //console.log("Original tags: ", tags);

  // Remove text from tags recursively, handling nested structures
  removeTextFromTags(tags, textToRemove);

  // Deep validate tags to remove invalid, null, or empty data
  deepValidateTags(tags);

  //console.log("Validated tags before writing: ", tags);

  // Write updated tags back to the file
  /**
   * Writes the specified tags to the given file path using the nodeID3 library.
   *
   * @param {Object} tags - The ID3 tags to write to the file.
   * @param {string} filePath - The path to the file where the tags will be written.
   * @returns {boolean} - Returns true if the tags were successfully written, otherwise false.
   */
  const success = nodeID3.write(tags, filePath);

  if (!success) {
    console.error(`Failed to write tags to file: ${filePath}`);
  }

  return success
    ? `Removed "${textToRemove}" from ${path.basename(filePath)}`
    : `Failed to update ${path.basename(filePath)}`;
});
