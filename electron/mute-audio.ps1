param(
    [string]$MuteStr = "true",
    [string]$FilterMode = "blacklist",
    [string[]]$Keywords = @("discord", "discordptb", "discordcanary", "discorddevelopment")
)

$Mute = ($MuteStr -eq "true" -or $MuteStr -eq "1" -or $MuteStr -eq "$true")

# Normalize: accepts either a real PowerShell array or a single comma-joined
# string (as arrives when powershell.exe is invoked externally with an
# unquoted comma list, since the calling process passes it as one argv token).
$Keywords = ($Keywords -join ',') -split ',' | Where-Object { $_ -ne '' }

$code = @"
using System;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Collections.Generic;

namespace AudioSessionCheck {
    [ComImport]
    [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection {
        int GetCount(out int count);
        int Item(int deviceIndex, out IMMDevice device);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr IntPtr, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2 {
        // Placeholders keep GetSessionEnumerator on its real vtable slot
        // (3rd method) - without them the interop call lands on
        // GetAudioSessionControl's slot instead and corrupts the call.
        int Skip_GetAudioSessionControl();
        int Skip_GetSimpleAudioVolume();
        int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnum);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator {
        int GetCount(out int count);
        int GetSession(int sessionIndex, out IAudioSessionControl session);
    }

    [Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl {
        int GetState(out int state);
        int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    }

    [Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface ISimpleAudioVolume {
        int SetMasterVolume(float level, ref Guid eventContext);
        int GetMasterVolume(out float level);
        int SetMute(bool isMuted, ref Guid eventContext);
        int GetMute(out bool isMuted);
    }

    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2 : IAudioSessionControl {
        new int GetState(out int state);
        new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        // Placeholders for the rest of the base IAudioSessionControl vtable
        // (SetDisplayName..UnregisterAudioSessionNotification) - without
        // them GetProcessId lands on the wrong slot and returns garbage.
        int Skip_SetDisplayName();
        int Skip_GetIconPath();
        int Skip_SetIconPath();
        int Skip_GetGroupingParam();
        int Skip_SetGroupingParam();
        int Skip_RegisterAudioSessionNotification();
        int Skip_UnregisterAudioSessionNotification();
        int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        int GetProcessId(out uint pid);
    }

    public class Manager {
        public static void SetAudioMute(bool mute, string mode, string[] keywords) {
            Console.WriteLine("[mute-audio] mute=" + mute + " mode=" + mode + " keywords=" + string.Join(",", keywords));
            try {
                bool isWhitelist = (mode.ToLower() == "whitelist");
                var targetPids = new HashSet<uint>();
                var allProcs = Process.GetProcesses();

                foreach (var p in allProcs) {
                    try {
                        string pName = p.ProcessName.ToLower();
                        string pTitle = "";
                        try { pTitle = p.MainWindowTitle.ToLower(); } catch {}

                        bool match = false;
                        foreach (var kw in keywords) {
                            if (string.IsNullOrEmpty(kw)) continue;
                            if (pName.Contains(kw) || pTitle.Contains(kw)) {
                                match = true;
                                break;
                            }
                        }

                        if (isWhitelist) {
                            if (!match) targetPids.Add((uint)p.Id);
                        } else {
                            if (match) targetPids.Add((uint)p.Id);
                        }
                    } catch {}
                }
                Console.WriteLine("[mute-audio] matched " + targetPids.Count + " target pid(s) by process name/title: " + string.Join(",", targetPids));

                Type enumeratorType = Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E"));
                if (enumeratorType == null) enumeratorType = Type.GetTypeFromCLSID(new Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"));
                if (enumeratorType == null) { Console.WriteLine("[mute-audio] FAILED: could not resolve MMDeviceEnumerator type"); return; }
                var enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(enumeratorType);

                IMMDeviceCollection devices;
                int hr = enumerator.EnumAudioEndpoints(2, 1, out devices);
                if (hr != 0 || devices == null) { Console.WriteLine("[mute-audio] FAILED: EnumAudioEndpoints hr=0x" + hr.ToString("X8")); return; }

                int devCount;
                devices.GetCount(out devCount);
                Console.WriteLine("[mute-audio] found " + devCount + " audio endpoint(s)");

                Guid iidSessionManager2 = typeof(IAudioSessionManager2).GUID;
                Guid zero = Guid.Empty;
                int mutedCount = 0;

                for (int d = 0; d < devCount; d++) {
                    Console.WriteLine("[mute-audio] --- device " + d + " ---");
                    IMMDevice device;
                    if (devices.Item(d, out device) != 0 || device == null) continue;

                    object o;
                    hr = device.Activate(ref iidSessionManager2, 23, IntPtr.Zero, out o);
                    if (hr != 0 || o == null) { Console.WriteLine("[mute-audio] device " + d + ": Activate(IAudioSessionManager2) failed hr=0x" + hr.ToString("X8")); continue; }

                    var mgr = (IAudioSessionManager2)o;
                    IAudioSessionEnumerator sessionEnum;
                    hr = mgr.GetSessionEnumerator(out sessionEnum);
                    if (hr != 0 || sessionEnum == null) { Console.WriteLine("[mute-audio] device " + d + ": GetSessionEnumerator failed hr=0x" + hr.ToString("X8")); continue; }

                    int count;
                    sessionEnum.GetCount(out count);
                    Console.WriteLine("[mute-audio] device " + d + ": " + count + " audio session(s)");

                    for (int i = 0; i < count; i++) {
                        IAudioSessionControl ctl;
                        if (sessionEnum.GetSession(i, out ctl) == 0 && ctl != null) {
                            var ctl2 = ctl as IAudioSessionControl2;
                            var vol = ctl as ISimpleAudioVolume;
                            if (ctl2 != null && vol != null) {
                                uint pid;
                                ctl2.GetProcessId(out pid);
                                string sid = "";
                                try { ctl2.GetSessionIdentifier(out sid); } catch {}
                                sid = sid ?? "";
                                string procName = "?";
                                try { procName = Process.GetProcessById((int)pid).ProcessName; } catch {}

                                bool isTarget = targetPids.Contains(pid);
                                if (!isTarget && !isWhitelist) {
                                    string sidLower = sid.ToLower();
                                    foreach (var kw in keywords) {
                                        if (string.IsNullOrEmpty(kw)) continue;
                                        if (sidLower.Contains(kw)) {
                                            isTarget = true;
                                            break;
                                        }
                                    }
                                }

                                Console.WriteLine("[mute-audio]   session " + i + ": pid=" + pid + " proc=" + procName + " target=" + isTarget);

                                if (isTarget) {
                                    int mhr = vol.SetMute(mute, ref zero);
                                    int vhr = vol.SetMasterVolume(mute ? 0.0f : 1.0f, ref zero);
                                    Console.WriteLine("[mute-audio]   -> SetMute hr=0x" + mhr.ToString("X8") + " SetMasterVolume hr=0x" + vhr.ToString("X8"));
                                    mutedCount++;
                                }
                            } else {
                                Console.WriteLine("[mute-audio]   session " + i + ": QueryInterface failed (ctl2=" + (ctl2 != null) + " vol=" + (vol != null) + ")");
                            }
                        }
                    }
                }
                Console.WriteLine("[mute-audio] done, applied to " + mutedCount + " session(s)");
            } catch (Exception ex) {
                Console.WriteLine("[mute-audio] EXCEPTION (" + ex.GetType().Name + "): " + ex.Message);
                Console.WriteLine("[mute-audio] STACK: " + ex.StackTrace);
            }
        }
    }
}
"@

try {
    Add-Type -TypeDefinition $code -Language CSharp -ErrorAction SilentlyContinue
} catch {}

try {
    [AudioSessionCheck.Manager]::SetAudioMute($Mute, $FilterMode, $Keywords)
} catch {}
