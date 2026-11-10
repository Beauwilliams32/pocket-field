import Cocoa
import WebKit
import CryptoKit
import Darwin
import CoreImage.CIFilterBuiltins

let fm = FileManager.default
let bundleRoot = Bundle.main.bundleURL.deletingLastPathComponent()
let root = URL(fileURLWithPath: ProcessInfo.processInfo.environment["POCKET_ROOT"] ?? bundleRoot.path)
let port: UInt16 = UInt16(ProcessInfo.processInfo.environment["POCKET_PORT"] ?? "18765") ?? 18765
let gamesDir = root.appendingPathComponent("Games")
let savesDir = root.appendingPathComponent("Saves")
let webDir = URL(fileURLWithPath: ProcessInfo.processInfo.environment["POCKET_WEB_ROOT"] ?? root.appendingPathComponent("Software/player").path)
let ioLock = NSLock()
func localIP() -> String {
    var ptr: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&ptr) == 0 else { return "127.0.0.1" }
    defer { freeifaddrs(ptr) }
    var p = ptr
    while let a = p?.pointee {
        defer { p = a.ifa_next }
        if String(cString: a.ifa_name) == "en0", let addr = a.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) {
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 { return String(cString: host) }
        }
    }
    return "127.0.0.1"
}
func gameFiles() -> [URL] {
    ((try? fm.contentsOfDirectory(at: gamesDir, includingPropertiesForKeys: nil)) ?? []).filter { ["gba", "gb", "gbc"].contains($0.pathExtension.lowercased()) && !$0.lastPathComponent.hasPrefix(".") }.sorted { $0.lastPathComponent < $1.lastPathComponent }
}
func gameID(_ file: URL) -> String { SHA256.hash(data: Data(file.lastPathComponent.utf8)).prefix(12).map { String(format: "%02x", $0) }.joined() }
func gameInfo(_ file: URL) -> [String: Any] {
    let id = gameID(file)
    let handle = try? FileHandle(forReadingFrom: file)
    let data = (try? handle?.read(upToCount: 256)) ?? Data()
    try? handle?.close()
    let code = data.count >= 176 ? String(data: data[172..<176], encoding: .ascii) ?? "" : ""
    let themes = ["BPRE": "firered", "BPEE": "emerald", "BPGE": "leafgreen"]
    let theme = themes[code] ?? "homebrew"
    let titles = ["firered": "FireRed", "emerald": "Emerald", "leafgreen": "LeafGreen"]
    let state = savesDir.appendingPathComponent(id + ".state")
    return ["id": id, "title": titles[theme] ?? file.deletingPathExtension().lastPathComponent, "theme": theme, "filename": file.lastPathComponent, "system": file.pathExtension.lowercased() == "gba" ? "gba" : "gb", "bytes": (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0, "saved": fm.fileExists(atPath: state.path), "savedAt": ((try? fm.attributesOfItem(atPath: state.path)[.modificationDate]) as? Date)?.timeIntervalSince1970 ?? 0]
}
func json(_ obj: Any) -> Data { (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])) ?? Data("{}".utf8) }
func reply(_ fd: Int32, _ code: Int, _ data: Data, _ mime: String = "application/json", headOnly: Bool = false) {
    let labels = [200:"OK", 400:"Bad Request", 403:"Forbidden", 404:"Not Found", 409:"Conflict", 413:"Payload Too Large", 500:"Internal Server Error", 507:"Insufficient Storage"]
    let head = "HTTP/1.1 \(code) \(labels[code] ?? "Error")\r\nContent-Type: \(mime)\r\nContent-Length: \(data.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n"
    let all = Data(head.utf8) + (headOnly ? Data() : data)
    all.withUnsafeBytes { bytes in
        var offset = 0
        while offset < all.count {
            let n = Darwin.send(fd, bytes.baseAddress!.advanced(by: offset), all.count - offset, 0)
            if n <= 0 { break }; offset += n
        }
    }
}
func error(_ fd: Int32, _ code: Int, _ message: String) { reply(fd, code, json(["error": message])) }
func serve(_ fd: Int32) {
    defer { Darwin.close(fd) }
    var timeout = timeval(tv_sec: 20, tv_usec: 0)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
    var noSig: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &noSig, 4)
    var buffer = Data(); var bytes = [UInt8](repeating: 0, count: 65536)
    var boundary: Range<Data.Index>?
    while boundary == nil {
        let n = recv(fd, &bytes, bytes.count, 0)
        if n <= 0 { return }; buffer.append(contentsOf: bytes.prefix(n))
        boundary = buffer.range(of: Data("\r\n\r\n".utf8))
        if boundary == nil && buffer.count > 16384 { error(fd, 400, "Header too large"); return }
    }
    let end = boundary!.upperBound
    let lines = String(decoding: buffer[..<boundary!.lowerBound], as: UTF8.self).components(separatedBy: "\r\n")
    let request = lines[0].split(separator: " ")
    guard request.count == 3 else { return }
    let method = String(request[0]); let path = String(request[1]).components(separatedBy: "?")[0].removingPercentEncoding ?? ""
    var headers: [String:String] = [:]
    for line in lines.dropFirst() { if let c = line.firstIndex(of: ":") { headers[String(line[..<c]).lowercased()] = line[line.index(after:c)...].trimmingCharacters(in:.whitespaces) } }
    let host = headers["host"] ?? ""
    let allowed = ["127.0.0.1:\(port)", "localhost:\(port)", "\(localIP()):\(port)"]
    guard allowed.contains(host) else { error(fd,403,"Unknown host"); return }
    if method == "POST" {
        guard headers["origin"] == "http://\(host)" else { error(fd,403,"Open Pocket Field to make changes"); return }
    }
    let length = Int(headers["content-length"] ?? "0") ?? -1
    guard length >= 0 && length <= 34 * 1024 * 1024 else { error(fd,413,"Choose a ROM smaller than 32 MB"); return }
    var body = Data(buffer[end...])
    while body.count < length { let n = recv(fd, &bytes, bytes.count, 0); if n <= 0 { return }; body.append(contentsOf: bytes.prefix(n)) }
    guard body.count == length else { error(fd,400,"Invalid request length"); return }
    if path == "/api/library" && method == "GET" {
        let attrs = (try? fm.attributesOfFileSystem(forPath: root.path)) ?? [:]
        reply(fd,200,json(["games": gameFiles().map(gameInfo), "free": attrs[.systemFreeSize] ?? 0, "total": attrs[.systemSize] ?? 0, "phoneURL": "http://\(localIP()):\(port)/", "drive": root.deletingLastPathComponent().lastPathComponent])); return
    }
    if path == "/api/qr" && method == "GET" {
        let filter = CIFilter.qrCodeGenerator(); filter.message = Data("http://\(localIP()):\(port)/".utf8)
        if let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8,y: 8)), let cg = CIContext().createCGImage(output, from: output.extent), let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) { reply(fd,200,png,"image/png") } else { error(fd,500,"QR unavailable") }; return
    }
    if path == "/api/import" && method == "POST" {
        let name = (headers["x-filename"]?.removingPercentEncoding ?? "").replacingOccurrences(of: "\\", with: "/")
        let file = URL(fileURLWithPath: name).lastPathComponent
        guard file == name, !file.hasPrefix("."), file.utf8.count < 180, ["gba","gb","gbc"].contains(URL(fileURLWithPath:file).pathExtension.lowercased()), body.count >= 256, body.count <= 32 * 1024 * 1024 else { error(fd,400,"Choose an extracted .gba, .gb, or .gbc game (up to 32 MB)"); return }
        ioLock.lock(); defer { ioLock.unlock() }
        let destination = gamesDir.appendingPathComponent(file)
        guard !fm.fileExists(atPath: destination.path) else { error(fd,409,"This filename is already installed"); return }
        let free = ((try? fm.attributesOfFileSystem(forPath: root.path)[.systemFreeSize]) as? NSNumber)?.int64Value ?? 0
        guard free > Int64(body.count + 3 * 1024 * 1024) else { error(fd,507,"The drive is full. Keep 3 MB free for saves."); return }
        do { try body.write(to: destination, options:.atomic); reply(fd,200,json(gameInfo(destination))) } catch { selfError(fd,error) }; return
    }
    for prefix in ["/api/rom/", "/api/save/"] where path.hasPrefix(prefix) {
        let id = String(path.dropFirst(prefix.count))
        guard let game = gameFiles().first(where: { gameID($0) == id }) else { error(fd,404,"Game not found on drive"); return }
        let file = prefix == "/api/rom/" ? game : savesDir.appendingPathComponent(id + ".state")
        if method == "GET" || method == "HEAD" { if let data = try? Data(contentsOf:file) { reply(fd,200,data,"application/octet-stream",headOnly:method == "HEAD") } else { error(fd,404,"No saved session yet") }; return }
        if method == "POST" && prefix == "/api/save/" {
            guard body.count > 0 && body.count < 2 * 1024 * 1024 else { error(fd,413,"Invalid save size"); return }
            ioLock.lock(); defer { ioLock.unlock() }
            do {
                if let old = try? Data(contentsOf:file) { try old.write(to:savesDir.appendingPathComponent(id + ".previous.state"),options:.atomic) }
                try body.write(to:file,options:.atomic); reply(fd,200,json(["saved":true]))
            } catch { selfError(fd,error) }; return
        }
    }
    guard method == "GET", !path.contains(".."), !path.contains("\0") else { error(fd,400,"Invalid path"); return }
    let file = webDir.appendingPathComponent(path == "/" ? "index.html" : String(path.dropFirst())).standardizedFileURL.resolvingSymlinksInPath()
    guard file.path.hasPrefix(webDir.resolvingSymlinksInPath().path + "/"), let data = try? Data(contentsOf:file) else { error(fd,404,"File not found"); return }
    let mimes = ["html":"text/html; charset=utf-8", "js":"text/javascript", "css":"text/css", "png":"image/png", "svg":"image/svg+xml", "json":"application/json", "wasm":"application/wasm"]
    reply(fd,200,data,mimes[file.pathExtension] ?? "application/octet-stream")
}
func selfError(_ fd: Int32, _ err: Error) { error(fd,500,"Could not write to drive: \(err.localizedDescription)") }
func startServer() -> Bool {
    let fd = socket(AF_INET,SOCK_STREAM,0); guard fd >= 0 else { return false }
    var yes: Int32 = 1; setsockopt(fd,SOL_SOCKET,SO_REUSEADDR,&yes,4)
    var addr = sockaddr_in(); addr.sin_family = sa_family_t(AF_INET); addr.sin_port = port.bigEndian; addr.sin_addr.s_addr = INADDR_ANY
    let result = withUnsafePointer(to:&addr) { $0.withMemoryRebound(to:sockaddr.self,capacity:1) { Darwin.bind(fd,$0,socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    guard result == 0, listen(fd,16) == 0 else { Darwin.close(fd); return false }
    DispatchQueue.global().async { while true { let client = accept(fd,nil,nil); if client < 0 { break }; DispatchQueue.global().async { serve(client) } } }
    return true
}
final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    func applicationDidFinishLaunching(_ notification: Notification) {
        guard fm.fileExists(atPath:webDir.appendingPathComponent("index.html").path) else { alert("Keep Pocket Field.app beside the Software, Games, and Saves folders on the drive."); return }
        do { try fm.createDirectory(at: gamesDir,withIntermediateDirectories:true); try fm.createDirectory(at:savesDir,withIntermediateDirectories:true) } catch { alert(error.localizedDescription); return }
        guard startServer() else { alert("Pocket Field is already open, or port 18765 is in use. Close the other copy before opening this one."); return }
        let config = WKWebViewConfiguration(); config.mediaTypesRequiringUserActionForPlayback = []
        web = WKWebView(frame:.zero,configuration:config); web.navigationDelegate = self
        web.isInspectable = true
        window = NSWindow(contentRect:NSRect(x:0,y:0,width:1160,height:810),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title = "Pocket Field"; window.minSize = NSSize(width:390,height:640); window.contentView=web; window.center(); window.makeKeyAndOrderFront(nil)
        let menu = NSMenu(); let item = NSMenuItem(); menu.addItem(item); let appMenu=NSMenu(); appMenu.addItem(withTitle:"Quit Pocket Field",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q"); item.submenu=appMenu; NSApp.mainMenu=menu
        web.load(URLRequest(url:URL(string:"http://127.0.0.1:\(port)/")!)); NSApp.activate(ignoringOtherApps:true)
    }
    func alert(_ message: String) { let a = NSAlert(); a.messageText="Pocket Field"; a.informativeText=message; a.runModal(); NSApp.terminate(nil) }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard web != nil else { return .terminateNow }
        web.evaluateJavaScript("typeof started !== 'undefined' && started") { result, _ in
            if (result as? Bool) == true {
                self.web.callAsyncJavaScript("return await saveSession(true)", arguments: [:], in: nil, in: .page) { result in
                    switch result {
                    case .success(let saved):
                        if (saved as? Bool) == true { sender.reply(toApplicationShouldTerminate: true) }
                        else { self.saveWarning(sender) }
                    case .failure: self.saveWarning(sender)
                    }
                }
            } else { sender.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }
    func saveWarning(_ sender: NSApplication) {
        let a=NSAlert(); a.messageText="Your session could not be saved"; a.informativeText="Reconnect the drive and try Save to drive before quitting."; a.addButton(withTitle:"Keep playing"); a.addButton(withTitle:"Quit without saving")
        sender.reply(toApplicationShouldTerminate: a.runModal() == .alertSecondButtonReturn)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool { true }
    func webView(_ webView:WKWebView,decidePolicyFor navigationAction:WKNavigationAction,decisionHandler:@escaping(WKNavigationActionPolicy)->Void) {
        if let url=navigationAction.request.url, url.host != "127.0.0.1", ["http","https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url); decisionHandler(.cancel) } else { decisionHandler(.allow) }
    }
}
if CommandLine.arguments.contains("--serve") {
    guard startServer() else { exit(1) }; print("Pocket Field server on \(port)"); RunLoop.main.run()
} else { let app=NSApplication.shared; let delegate=App(); app.delegate=delegate; app.setActivationPolicy(.regular); app.run() }
