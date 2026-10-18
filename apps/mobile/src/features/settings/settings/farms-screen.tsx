import { useLocale } from '../../../ui/locale/locale-provider';
import { useSettingsApi } from '../api/use-api';
import { go } from '../go';
import { Group, NavBar, Note, Page, Row } from '../kit/layout';
import { useRemote } from '../use-remote';

/** The farms you live on, each leading to its settings, where you can also leave it quietly. */
export function FarmsScreen() {
  const { t } = useLocale();
  const api = useSettingsApi();
  const farms = useRemote(() => api.farms());
  const list = (farms.data?.farms ?? []).filter((f) => f.kind === 'farm');
  return (
    <Page header={<NavBar title={t('settings.yourFarms')} />}>
      {list.length > 0 ? (
        <Group>
          {list.map((f) => (
            <Row
              key={f.farm}
              icon="farm"
              title={f.name ?? ''}
              {...(f.role === 'critter'
                ? {}
                : {
                    subtitle: t(
                      f.role === 'keeper' ? 'settings.members.keeper' : 'settings.members.helper',
                    ),
                  })}
              onPress={() =>
                go({ pathname: '/(tabs)/you/farm-settings', params: { farm: f.farm } })
              }
            />
          ))}
        </Group>
      ) : null}
      <Note
        text={
          farms.data && list.length === 0
            ? t('settings.yourFarms.none')
            : t('settings.yourFarms.note')
        }
      />
    </Page>
  );
}
