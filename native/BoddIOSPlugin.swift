import Foundation
import Capacitor
import Security
import UIKit

@objc(BoddIOSPlugin)
public class BoddIOSPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BoddIOSPlugin"
    public let jsName = "BoddIOS"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loadAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveAccount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getJSON", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise)
    ]
    private var accountQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "com.boddflix.ios") + ".accounts",
         kSecAttrAccount as String: "saved-accounts"]
    }

    @objc func loadAccount(_ call: CAPPluginCall) {
        var query = accountQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": "null"]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Saved accounts are unavailable from Keychain."); return
        }
        call.resolve(["value": value])
    }

    @objc func saveAccount(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), let data = value.data(using: .utf8),
              data.count <= 1_048_576,
              (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) != nil else {
            call.reject("Invalid account data."); return
        }
        if value == "null" {
            let status = SecItemDelete(accountQuery as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else {
                call.reject("Could not remove the saved accounts."); return
            }
            call.resolve(); return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        var status = SecItemUpdate(accountQuery as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var query = accountQuery
            attributes.forEach { query[$0.key] = $0.value }
            status = SecItemAdd(query as CFDictionary, nil)
        }
        guard status == errSecSuccess else { call.reject("Could not save accounts in Keychain."); return }
        call.resolve()
    }

    @objc func getJSON(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil, url.user == nil, url.password == nil,
              url.lastPathComponent == "player_api.php" else {
            call.reject("Unsupported provider address."); return
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 25
        configuration.timeoutIntervalForResource = 45
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let session = URLSession(configuration: configuration)
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            guard error == nil, let response = response as? HTTPURLResponse,
                  (200...299).contains(response.statusCode), let data = data,
                  data.count <= 67_108_864,
                  (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) != nil,
                  let value = String(data: data, encoding: .utf8) else {
                // Do not include provider URLs or credentials in diagnostic messages.
                call.reject("Provider request failed. Check the account, connection and TLS certificate."); return
            }
            call.resolve(["value": value])
        }.resume()
    }

    @objc func keepAwake(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = active
            call.resolve()
        }
    }
}
