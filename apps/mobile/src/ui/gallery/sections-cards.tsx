import { View } from 'react-native';

import { ArtIcon } from '../art/art-view';
import { CreditCard, NoticeCard, PlanCard } from '../components/card';
import { Chip } from '../components/chip';
import { ListGroup, ListRow } from '../components/list-row';
import { useLocale } from '../locale/locale-provider';
import { useTheme } from '../theme/theme-provider';
import { Txt } from '../type/text';
import { Note, Panel } from './panel';

const noop = () => undefined;

export function CardsSection() {
  const { t } = useLocale();
  return (
    <Panel title={t('gallery.section.cards')}>
      <View style={{ gap: 10 }}>
        <PlanCard
          stage={3}
          eyebrow={t('gallery.card.planEyebrow')}
          title={t('gallery.card.planTitle')}
          detail={t('gallery.card.planDetail')}
          onPress={noop}
        />
        <CreditCard
          friends={[
            { name: t('gallery.name.fig'), kind: 'frog' },
            { name: t('gallery.bubble.name'), kind: 'sheep' },
            { name: t('gallery.bubble.quietName'), kind: 'mole' },
          ]}
          lead={t('gallery.card.creditTitle')}
          rest={t('gallery.card.creditBody')}
        />
        <NoticeCard text={t('gallery.card.notice')} />
        <ListGroup>
          <ListRow
            icon="bell"
            title={t('gallery.card.listTitle')}
            subtitle={t('gallery.card.listSubtitle')}
            onPress={noop}
          />
          <ListRow
            critter={{ name: t('gallery.name.otis'), kind: 'owl' }}
            title={t('gallery.card.memberTitle')}
            subtitle={t('gallery.card.memberSubtitle')}
            trailing={<Chip label={t('gallery.card.invite')} kind="ink" onPress={noop} />}
          />
        </ListGroup>
      </View>
    </Panel>
  );
}

/** The icon set in the order `01 Foundations` lays it out. */
const ICONS = (
  'dewdrop firefly wave note seed sun sprout lantern photo envelope raincloud bee rosette hat ' +
  'heart farm chat seeds camera mic muted ear pencil plus search pin reply trash link share flag ' +
  'block lock key bell door gear people check clock moon sparkle leaf play more'
).split(' ');

export function IconsSection() {
  const { t } = useLocale();
  const { palette } = useTheme();
  return (
    <Panel title={t('gallery.section.icons')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {ICONS.map((name) => {
          const night = name === 'firefly';
          return (
            <View
              key={name}
              style={{
                width: 77,
                alignItems: 'center',
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 4,
                borderRadius: 16,
                backgroundColor: night ? palette.firefly.bg : palette.card,
              }}
            >
              <ArtIcon name={name} size={34} color={palette.text} />
              <Txt
                variant="note"
                mono
                color={night ? palette.firefly.fg : palette.secondary}
                style={{ fontSize: 11.5, lineHeight: 11.5 }}
              >
                {name}
              </Txt>
            </View>
          );
        })}
      </View>
      <Note>{t('gallery.icons.note')}</Note>
    </Panel>
  );
}
