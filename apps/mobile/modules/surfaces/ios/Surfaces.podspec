Pod::Spec.new do |s|
  s.name           = 'Surfaces'
  s.version        = '1.0.0'
  s.summary        = 'The app side of the native surfaces: Live Activities and the pasteboard.'
  s.description    = s.summary
  s.author         = 'Odd Eggs Studio'
  s.homepage       = 'https://kithfield.com'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.swift_version  = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ActivityKit', 'UIKit'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
