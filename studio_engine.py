"""
Frozen entry point for the RoboStore Studio engine sidecar.

PyInstaller bundles this into a single self-contained binary (`studio-engine`)
that the Tauri app launches as a sidecar. Uses absolute imports so it freezes
cleanly as __main__ while still pulling in the whole `engine` package (and its
bundled bc_stark_sdk + libusb).
"""

from engine.run import main

if __name__ == "__main__":
    main()
