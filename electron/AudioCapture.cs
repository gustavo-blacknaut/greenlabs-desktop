using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Management;
using System.Net;
using System.Runtime.InteropServices;
using System.Threading;

namespace GreenLabsAudio {

    [StructLayout(LayoutKind.Sequential)]
    public struct AUDCLNT_PROCESS_LOOPBACK_PARAMS { public uint TargetProcessId; public int ProcessLoopbackMode; }
    [StructLayout(LayoutKind.Sequential)]
    public struct AUDIOCLIENT_ACTIVATION_PARAMS { public int ActivationType; public AUDCLNT_PROCESS_LOOPBACK_PARAMS ProcessLoopbackParams; }
    [StructLayout(LayoutKind.Sequential)]
    public struct BLOB { public uint cbSize; public IntPtr pBlobData; }
    [StructLayout(LayoutKind.Explicit)]
    public struct PROPVARIANT_SAFE { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public BLOB blob; }

    [Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivateAudioInterfaceAsyncOperation {
        int GetActivateResult(out int activateResult, [MarshalAs(UnmanagedType.IUnknown)] out object activatedInterface);
    }

    // GetDevicePeriod must stay: dropping it shifts every later vtable slot.
    [Guid("1CB9AD4C-DBFA-4C32-B178-C2F568A703B2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioClient {
        int Initialize(int shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr waveFormat, ref Guid sessionGuid);
        int GetBufferSize(out uint bufferSize);
        int GetStreamLatency(out long latency);
        int GetCurrentPadding(out uint padding);
        int IsFormatSupported(int shareMode, IntPtr fmt, out IntPtr closest);
        int GetMixFormat(out IntPtr fmt);
        int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
        int Start();
        int Stop();
        int Reset();
        int SetEventHandle(IntPtr handle);
        int GetService(ref Guid iid, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    }

    [Guid("C8ADBD64-E71E-48A0-A4DE-185C395CD317"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioCaptureClient {
        int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devPos, out ulong qpcPos);
        int ReleaseBuffer(uint frames);
        int GetNextPacketSize(out uint frames);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate(ref Guid id, int clsCtx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
    }

    [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionManager2 {
        int Skip_GetAudioSessionControl();
        int Skip_GetSimpleAudioVolume();
        int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }

    [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionEnumerator {
        int GetCount(out int count);
        int GetSession(int index, [MarshalAs(UnmanagedType.IUnknown)] out object session);
    }

    [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioSessionControl2 {
        int GetState(out int state);
        int Skip_GetDisplayName();
        int Skip_SetDisplayName();
        int Skip_GetIconPath();
        int Skip_SetIconPath();
        int Skip_GetGroupingParam();
        int Skip_SetGroupingParam();
        int Skip_RegisterAudioSessionNotification();
        int Skip_UnregisterAudioSessionNotification();
        int Skip_GetSessionIdentifier();
        int Skip_GetSessionInstanceIdentifier();
        int GetProcessId(out uint pid);
        int IsSystemSoundsSession();
    }

    // Raw COM object instead of a CCW: ActivateAudioInterfaceAsync needs an
    // agile handler, so QueryInterface answers IAgileObject itself.
    public class NativeHandler : IDisposable {
        delegate int QIFn(IntPtr self, ref Guid iid, out IntPtr ppv);
        delegate uint RefFn(IntPtr self);
        delegate int ActFn(IntPtr self, IntPtr op);

        static readonly Guid IID_IUnknown = new Guid("00000000-0000-0000-C000-000000000046");
        static readonly Guid IID_IAgileObject = new Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90");
        static readonly Guid IID_Handler = new Guid("41D949AB-9862-444A-80F6-C261334DA5EB");

        readonly QIFn _qi;
        readonly RefFn _addRef;
        readonly RefFn _release;
        readonly ActFn _act;
        IntPtr _vtbl, _obj;
        int _refs = 1;

        public ManualResetEvent Done = new ManualResetEvent(false);
        public int ActivateHr = -1;
        public object Activated;
        public IntPtr Ptr { get { return _obj; } }

        public NativeHandler() {
            _qi = QueryInterface;
            _addRef = AddRef;
            _release = Release;
            _act = ActivateCompleted;
            _vtbl = Marshal.AllocHGlobal(IntPtr.Size * 4);
            Marshal.WriteIntPtr(_vtbl, 0, Marshal.GetFunctionPointerForDelegate(_qi));
            Marshal.WriteIntPtr(_vtbl, IntPtr.Size, Marshal.GetFunctionPointerForDelegate(_addRef));
            Marshal.WriteIntPtr(_vtbl, IntPtr.Size * 2, Marshal.GetFunctionPointerForDelegate(_release));
            Marshal.WriteIntPtr(_vtbl, IntPtr.Size * 3, Marshal.GetFunctionPointerForDelegate(_act));
            _obj = Marshal.AllocHGlobal(IntPtr.Size);
            Marshal.WriteIntPtr(_obj, _vtbl);
        }

        int QueryInterface(IntPtr self, ref Guid iid, out IntPtr ppv) {
            if (iid == IID_IUnknown || iid == IID_Handler || iid == IID_IAgileObject) {
                ppv = self;
                Interlocked.Increment(ref _refs);
                return 0;
            }
            ppv = IntPtr.Zero;
            return unchecked((int)0x80004002);
        }
        uint AddRef(IntPtr self) { return (uint)Interlocked.Increment(ref _refs); }
        uint Release(IntPtr self) { return (uint)Interlocked.Decrement(ref _refs); }

        int ActivateCompleted(IntPtr self, IntPtr op) {
            try {
                var o = (IActivateAudioInterfaceAsyncOperation)Marshal.GetObjectForIUnknown(op);
                int hr;
                object iface;
                o.GetActivateResult(out hr, out iface);
                ActivateHr = hr;
                Activated = iface;
            } catch (Exception ex) {
                Server.Log("[handler] " + ex.Message);
            }
            Done.Set();
            return 0;
        }

        public void Dispose() {
            if (_obj != IntPtr.Zero) { Marshal.FreeHGlobal(_obj); _obj = IntPtr.Zero; }
            if (_vtbl != IntPtr.Zero) { Marshal.FreeHGlobal(_vtbl); _vtbl = IntPtr.Zero; }
            GC.KeepAlive(_qi);
            GC.KeepAlive(_addRef);
            GC.KeepAlive(_release);
            GC.KeepAlive(_act);
        }
    }

    // System mix minus one process tree. Excluding beats including each app:
    // anything launched later is picked up without extra setup.
    public class ExcludingCapture : IDisposable {
        [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
        static extern int ActivateAudioInterfaceAsync(
            [MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid riid,
            IntPtr activationParams, IntPtr handler, out IntPtr op);

        [DllImport("kernel32.dll")] static extern IntPtr CreateEvent(IntPtr a, bool m, bool i, string n);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);

        public const int SampleRate = 48000;
        public const int Channels = 2;

        IAudioClient _client;
        IAudioCaptureClient _capture;
        IntPtr _event;
        NativeHandler _handler;
        IntPtr _pAp = IntPtr.Zero, _pPv = IntPtr.Zero, _pFmt = IntPtr.Zero;

        public ExcludingCapture(uint excludePid) {
            var ap = new AUDIOCLIENT_ACTIVATION_PARAMS();
            ap.ActivationType = 1; // PROCESS_LOOPBACK
            ap.ProcessLoopbackParams.TargetProcessId = excludePid;
            ap.ProcessLoopbackParams.ProcessLoopbackMode = 1; // EXCLUDE_TARGET_PROCESS_TREE
            _pAp = Marshal.AllocHGlobal(Marshal.SizeOf(ap));
            Marshal.StructureToPtr(ap, _pAp, false);

            var pv = new PROPVARIANT_SAFE();
            pv.vt = 65; // VT_BLOB
            pv.blob.cbSize = (uint)Marshal.SizeOf(ap);
            pv.blob.pBlobData = _pAp;
            int pvSize = Marshal.SizeOf(pv);
            _pPv = Marshal.AllocHGlobal(pvSize);
            for (int i = 0; i < pvSize; i++) Marshal.WriteByte(_pPv, i, 0);
            Marshal.StructureToPtr(pv, _pPv, false);

            _handler = new NativeHandler();
            Guid iid = typeof(IAudioClient).GUID;
            IntPtr op;
            int hr = ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iid, _pPv, _handler.Ptr, out op);
            if (hr != 0) throw new Exception("ActivateAudioInterfaceAsync hr=0x" + hr.ToString("X8"));
            if (!_handler.Done.WaitOne(4000)) throw new Exception("activation timed out");
            if (_handler.ActivateHr != 0 || _handler.Activated == null)
                throw new Exception("activation hr=0x" + _handler.ActivateHr.ToString("X8"));
            _client = (IAudioClient)_handler.Activated;

            // Process loopback only accepts IEEE float32.
            _pFmt = Marshal.AllocHGlobal(18);
            Marshal.WriteInt16(_pFmt, 0, 3); // WAVE_FORMAT_IEEE_FLOAT
            Marshal.WriteInt16(_pFmt, 2, (short)Channels);
            Marshal.WriteInt32(_pFmt, 4, SampleRate);
            Marshal.WriteInt32(_pFmt, 8, SampleRate * Channels * 4);
            Marshal.WriteInt16(_pFmt, 12, (short)(Channels * 4));
            Marshal.WriteInt16(_pFmt, 14, 32);
            Marshal.WriteInt16(_pFmt, 16, 0);

            Guid ng = Guid.Empty;
            int flags = unchecked((int)0x00020000) | unchecked((int)0x00040000); // LOOPBACK | EVENTCALLBACK
            // 200ms, the size the official ApplicationLoopback sample uses. This had been
            // 5 seconds - way oversized, and not how a real-time capture buffer should be sized.
            hr = _client.Initialize(0, flags, 200 * 10000L, 0, _pFmt, ref ng);
            if (hr != 0) throw new Exception("Initialize hr=0x" + hr.ToString("X8"));

            _event = CreateEvent(IntPtr.Zero, false, false, null);
            _client.SetEventHandle(_event);

            Guid iidCap = typeof(IAudioCaptureClient).GUID;
            object oCap;
            hr = _client.GetService(ref iidCap, out oCap);
            if (hr != 0 || oCap == null) throw new Exception("GetService hr=0x" + hr.ToString("X8"));
            _capture = (IAudioCaptureClient)oCap;

            _client.Start();
        }

        // Returns null when no packet is ready, so the caller can pad silence.
        public float[] ReadAvailable() {
            WaitForSingleObject(_event, 100);
            List<float> acc = null;
            uint packet;
            _capture.GetNextPacketSize(out packet);
            while (packet > 0) {
                IntPtr pData;
                uint frames, flags;
                ulong dp, qp;
                _capture.GetBuffer(out pData, out frames, out flags, out dp, out qp);
                int n = (int)frames * Channels;
                if (n > 0) {
                    if (acc == null) acc = new List<float>(n);
                    if (pData != IntPtr.Zero && (flags & 1) == 0) {
                        var buf = new float[n];
                        Marshal.Copy(pData, buf, 0, n);
                        acc.AddRange(buf);
                    } else {
                        for (int i = 0; i < n; i++) acc.Add(0f);
                    }
                }
                _capture.ReleaseBuffer(frames);
                _capture.GetNextPacketSize(out packet);
            }
            return acc == null ? null : acc.ToArray();
        }

        public void Dispose() {
            try { if (_client != null) _client.Stop(); } catch { }
            try { if (_event != IntPtr.Zero) CloseHandle(_event); } catch { }
            try { if (_handler != null) _handler.Dispose(); } catch { }
            foreach (var p in new[] { _pFmt, _pPv, _pAp })
                if (p != IntPtr.Zero) { try { Marshal.FreeHGlobal(p); } catch { } }
        }
    }

    public class Server {
        static bool _running = true;
        static string[] _excludeApps = new string[] { "discord" };

        public static void Log(string msg) { try { Console.WriteLine(msg); } catch { } }

        static HashSet<uint> PidsWithAudioSessions() {
            var set = new HashSet<uint>();
            try {
                var en = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
                IMMDevice dev;
                if (en.GetDefaultAudioEndpoint(0, 1, out dev) != 0 || dev == null) return set;
                Guid iidMgr = typeof(IAudioSessionManager2).GUID;
                object oMgr;
                if (dev.Activate(ref iidMgr, 23, IntPtr.Zero, out oMgr) != 0 || oMgr == null) return set;
                var mgr = (IAudioSessionManager2)oMgr;
                IAudioSessionEnumerator se;
                mgr.GetSessionEnumerator(out se);
                int count;
                se.GetCount(out count);
                for (int i = 0; i < count; i++) {
                    try {
                        object oS;
                        se.GetSession(i, out oS);
                        var c2 = (IAudioSessionControl2)oS;
                        uint pid;
                        if (c2.GetProcessId(out pid) == 0 && pid != 0) set.Add(pid);
                    } catch { }
                }
            } catch { }
            return set;
        }

        static Dictionary<uint, uint> ParentMap() {
            var parents = new Dictionary<uint, uint>();
            try {
                using (var s = new ManagementObjectSearcher("SELECT ProcessId, ParentProcessId FROM Win32_Process")) {
                    foreach (ManagementObject mo in s.Get()) {
                        try {
                            parents[Convert.ToUInt32(mo["ProcessId"])] = Convert.ToUInt32(mo["ParentProcessId"]);
                        } catch { }
                    }
                }
            } catch { }
            return parents;
        }

        // Discord spans several processes: find the one rendering audio, then
        // climb to the topmost Discord ancestor and exclude that whole tree.
        /// PIDs da nossa própria árvore (este processo, seus ancestrais e
        /// descendentes). Nada aqui pode ser alvo da exclusão.
        static HashSet<uint> SelfTree() {
            var tree = new HashSet<uint>();
            try {
                uint self = (uint)Process.GetCurrentProcess().Id;
                tree.Add(self);
                var parents = ParentMap();

                // Sobe até o topo: o Electron abre o capturador como filho,
                // então o app inteiro precisa ficar de fora.
                uint cur = self;
                var guard = new HashSet<uint>();
                while (guard.Add(cur)) {
                    uint ppid;
                    if (!parents.TryGetValue(cur, out ppid) || ppid == 0) break;
                    if (!tree.Add(ppid)) break;
                    cur = ppid;
                }

                // E desce: filhos de qualquer um que já esteja na árvore.
                bool cresceu = true;
                while (cresceu) {
                    cresceu = false;
                    foreach (var par in parents) {
                        if (tree.Contains(par.Value) && tree.Add(par.Key)) cresceu = true;
                    }
                }
            } catch { }
            return tree;
        }

        static uint FindExcludeRootPid() {
            // O modo EXCLUDE aceita UMA árvore de processos. Se a nossa própria
            // árvore entrar na lista de candidatos, o capturador exclui a si
            // mesmo e o alvo de verdade (o Discord) passa direto - que é o
            // sintoma de "o som do Discord voltou". Por isso a árvore do
            // capturador nunca é candidata.
            var selfTree = SelfTree();

            var matched = new List<uint>();
            foreach (var p in Process.GetProcesses()) {
                try {
                    uint pid = (uint)p.Id;
                    if (selfTree.Contains(pid)) continue;
                    string n = p.ProcessName.ToLower();
                    foreach (var ex in _excludeApps) {
                        var t = ex.ToLower().Trim();
                        if (t.Length > 0 && n.Contains(t)) { matched.Add(pid); break; }
                    }
                } catch { }
            }
            if (matched.Count == 0) return 0;
            // Ordenado para a escolha ser sempre a mesma: antes vinha de um
            // HashSet, cuja ordem muda entre execuções, então o processo
            // escolhido variava sem nada ter mudado.
            matched.Sort();

            var withAudio = PidsWithAudioSessions();
            var parents = ParentMap();

            uint seed = 0;
            foreach (var pid in matched) {
                if (withAudio.Contains(pid)) { seed = pid; break; }
            }
            if (seed == 0) seed = matched[0];

            uint root = seed;
            var guard = new HashSet<uint>();
            while (guard.Add(root)) {
                uint ppid;
                if (!parents.TryGetValue(root, out ppid)) break;
                if (!matched.Contains(ppid)) break;
                root = ppid;
            }

            Log("[exclude] audio-session pid " + seed + " (" + SafeName(seed) + ") -> tree root "
                + root + " (" + SafeName(root) + ")");
            return root;
        }

        static string SafeName(uint pid) {
            try { return Process.GetProcessById((int)pid).ProcessName; } catch { return "?"; }
        }

        [MTAThread]
        static int Main(string[] args) {
            int port = 25641;
            foreach (var a in args) {
                if (a.StartsWith("--port=")) int.TryParse(a.Substring(7), out port);
                else if (a.StartsWith("--exclude=")) _excludeApps = a.Substring(10).Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
            }

            var listener = new HttpListener();
            listener.Prefixes.Add("http://127.0.0.1:" + port + "/audio/");
            listener.Start();
            Log("Audio capture listening on " + port + " (excluding: " + string.Join(", ", _excludeApps) + ")");

            while (_running) {
                try {
                    var ctx = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(delegate { HandleStream(ctx); });
                } catch { if (!_running) break; }
            }
            return 0;
        }

        static void HandleStream(HttpListenerContext ctx) {
            ExcludingCapture cap = null;
            try {
                Log("[stream] new connection");

                uint excludePid = FindExcludeRootPid();
                if (excludePid == 0) {
                    // Nothing to exclude: fall back to our own pid.
                    excludePid = (uint)Process.GetCurrentProcess().Id;
                    Log("[exclude] no target running, excluding self (" + excludePid + ")");
                }

                cap = new ExcludingCapture(excludePid);
                Log("[stream] capturing system audio minus pid " + excludePid);

                ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                ctx.Response.Headers.Add("Access-Control-Expose-Headers", "X-Sample-Rate, X-Channels, X-Bits");
                ctx.Response.Headers.Add("X-Sample-Rate", ExcludingCapture.SampleRate.ToString());
                ctx.Response.Headers.Add("X-Channels", ExcludingCapture.Channels.ToString());
                ctx.Response.Headers.Add("X-Bits", "32");
                ctx.Response.ContentType = "application/octet-stream";
                ctx.Response.SendChunked = true;

                int silenceSamples = (ExcludingCapture.SampleRate / 100) * ExcludingCapture.Channels; // 10ms
                var silence = new byte[silenceSamples * 4];

                using (var output = ctx.Response.OutputStream) {
                    while (_running && ctx.Response.OutputStream.CanWrite) {
                        var block = cap.ReadAvailable();
                        if (block == null || block.Length == 0) {
                            output.Write(silence, 0, silence.Length);
                        } else {
                            var bytes = new byte[block.Length * 4];
                            Buffer.BlockCopy(block, 0, bytes, 0, bytes.Length);
                            output.Write(bytes, 0, bytes.Length);
                        }
                        output.Flush();
                    }
                }
            } catch (Exception ex) {
                Log("[stream] ended: " + ex.Message);
            } finally {
                if (cap != null) { try { cap.Dispose(); } catch { } }
            }
        }
    }
}
