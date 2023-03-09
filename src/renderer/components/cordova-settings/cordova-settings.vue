<template>
  <ft-settings-section
    :title="$t('Settings.Cordova Settings.Cordova Settings')"
  >
    <div class="switchColumnGrid">
      <ft-toggle-switch
        :label="$t('Settings.Cordova Settings.Disable Background Notification')"
        :compact="true"
        :tooltip="$t('Tooltips.Cordova Settings.Disable Background Notification')"
        :default-value="getDisableBackgroundModeNotification"
        @change="updateDisableBackgroundModeNotification"
      />
      <ft-toggle-switch
        :label="$t('Settings.Cordova Settings.Show Thumbnail in Media Controls')"
        :compact="true"
        :tooltip="$t('Tooltips.Cordova Settings.Show Thumbnail in Media Controls')"
        :default-value="getShowThumbnailInMediaControls"
        @change="updateShowThumbnailInMediaControls"
      />
    </div>
  </ft-settings-section>
</template>

<script src="./cordova-settings.js" />
