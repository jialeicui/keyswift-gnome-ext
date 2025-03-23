import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

// D-Bus interface XML
const ifaceXml = `
<node>
  <interface name="com.github.keyswift.WindowMonitor">
    <method name="GetActiveWindow">
      <arg type="s" direction="out" name="windowInfo"/>
    </method>
    <signal name="StatusChanged">
      <arg type="b" name="isConnected"/>
    </signal>
  </interface>
</node>`;

const StatusIndicator = GObject.registerClass(
class StatusIndicator extends PanelMenu.Button {
    constructor() {
        super(0.0, 'Status Indicator');

        this.icon = new St.Icon({
            icon_name: 'face-smile-symbolic',
            style_class: 'system-status-icon'
        });

        this.add_child(this.icon);
    }

    setSuccess() {
        this.icon.icon_name = 'face-smile-symbolic';
    }

    setError() {
        this.icon.icon_name = 'face-sad-symbolic';
    }
});

export default class QuickSettingsExampleExtension extends Extension {
    enable() {
        // Initialize current window info
        this._currentWindowInfo = {
            class: '',
            title: ''
        };

        // Create and add the status indicator to the panel
        this._statusIndicator = new StatusIndicator();
        Main.panel.addToStatusArea('status-indicator', this._statusIndicator, 0, 'right');

        // Set up D-Bus interface
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(ifaceXml, {
            GetActiveWindow: () => {
                // Show smile face when method is called
                this._statusIndicator.setSuccess();
                return JSON.stringify(this._currentWindowInfo);
            }
        });

        this._dbusImpl.export(Gio.DBus.session, '/com/github/keyswift/WindowMonitor');

        this._handlerId = global.display.connect('notify::focus-window', () => {
            let window = global.display.focus_window;
            let wmClass = '';
            let title = '';

            if (window) {
                wmClass = window.get_wm_class();
                title = window.get_title();
            }

            // Update current window info
            this._currentWindowInfo = {
                class: wmClass || '',
                title: title || ''
            };

            // Send the wmClass and title to D-Bus server
            this._sendWindowInfoToDbus(wmClass, title);
        });

        // Set initial state
        const focusWindow = global.display.focus_window;
        if (focusWindow) {
            const wmClass = focusWindow.get_wm_class();
            const title = focusWindow.get_title();
            this._currentWindowInfo = {
                class: wmClass || '',
                title: title || ''
            };
            this._sendWindowInfoToDbus(wmClass, title);
        }
    }

    _sendWindowInfoToDbus(wmClass, title) {
        try {
            // D-Bus parameters defined in the comment at the top of the file
            const busName = 'com.github.keyswift.WindowMonitor';
            const busPath = '/com/github/keyswift/WindowMonitor';
            const busInterface = 'com.github.keyswift.WindowMonitor';
            const methodName = 'UpdateActiveWindow';

            // Create JSON object with both wmClass and title
            const windowInfo = JSON.stringify({
                class: wmClass || '',
                title: title || ''
            });

            // Create a D-Bus proxy for the method call
            // Use GLib.Variant to create the parameter for the method
            let variant = new GLib.Variant('(s)', [windowInfo]);

            // Send the window info to the D-Bus server
            Gio.DBus.session.call(
                busName,
                busPath,
                busInterface,
                methodName,
                variant,
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null,
                (connection, result) => {
                    try {
                        connection.call_finish(result);
                        // Don't show smile icon here anymore since we want to show it only on external calls
                    } catch (e) {
                        // Show cry icon on failure
                        this._statusIndicator.setError();
                        console.error(`Failed to send window info to D-Bus: ${e.message}`);
                    }
                }
            );
        } catch (e) {
            // Show cry icon on error
            this._statusIndicator.setError();
            console.error(`Error setting up D-Bus call: ${e.message}`);
        }
    }

    disable() {
        // Disconnect the signal handler
        if (this._handlerId !== undefined) {
            global.display.disconnect(this._handlerId);
            this._handlerId = undefined;
        }

        // Unexport D-Bus interface
        if (this._dbusImpl) {
            this._dbusImpl.unexport();
            this._dbusImpl = null;
        }

        // Remove and destroy the status indicator
        if (this._statusIndicator) {
            this._statusIndicator.destroy();
            this._statusIndicator = null;
        }

        // Clear current window info
        this._currentWindowInfo = null;
    }
}
